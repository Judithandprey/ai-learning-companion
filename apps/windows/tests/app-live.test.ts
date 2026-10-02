// The AI's session through the app: the real main.ts and overlay.ts under the unit-test fakes. The user's own Start
// starts it, with the bounds the user set; ChatGPT is then given whole pictures of the display as it changes, one
// request at a time, never faster than the least time between two looks and never into the requests kept for the
// user's own circles and questions; what it noted joins the conversation and is never shown as help; a failure that
// is not simply "not taken" ends the session until the user starts it again; nothing renews it.
// SYNTHETIC: the connector is a stand-in (tests/subscription-fakes.ts), the display is a fake and every "response" is
// text this test wrote. No capture of a real screen, no Codex, no ChatGPT, no sign-in and no network are involved.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { harness, plain, quitLinks, running, settle as started, type FakeWindow } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { connectorConfig, fakeConnectors, removeConfigs, type FakeConnector } from './subscription-fakes.ts';
import { LIVE_VERSION, type Policy, type Turn } from '../src/shared/live.ts';

after(quitLinks);
after(removeConfigs);
const POLICY: Policy = { max_submissions: 60, max_session_ms: 1_800_000, min_observation_interval_ms: 30_000 };
const settle = (): Promise<void> => new Promise((done) => setImmediate(done));
type Live = { state: string; since?: string; reason?: string | null; model?: string; max_submissions?: number; used?: number; reserve?: number; paused?: string | null; missed?: string | null; ended?: string | null; seen?: { at: string; frame_seq: number } | null; frames?: number; out?: number; unwritten?: number };

/**
 * The app with the subscription configured; by default checked (signed in) and the capture started with the AI's
 * session within `policy`. `ai: false`: the capture alone. `check: false`: not checked before Start.
 */
async function app(o: { policy?: Policy; ai?: boolean; check?: boolean; configure?: (c: FakeConnector) => void; /** the capture keeps at most this many whole-display frames */ max_frames?: number } = {}) {
  const fakes = fakeConnectors(o.configure);
  const h = harness({ env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig() }, subscription: { spawn: fakes.spawn, request_ms: 500, ask_ms: 20_000, end_ms: 500 } });
  await started();
  const control = h.control() as unknown as FakeWindow;
  const press = (channel: string, ...args: unknown[]): unknown => h.handlers[channel]!({ sender: control.webContents }, ...args);
  const live = (): Live => (plain(press('lc:session-state')) as { live?: Live }).live ?? { state: 'no capture' };
  if (o.check !== false) {
    press('lc:sub-check');
    await until('signed in', () => (plain(press('lc:sub-state')) as { state?: string }).state === 'signed_in', 3000);
  }
  const policy = o.policy ?? POLICY;
  const s = await running(h, o.ai === false ? null : { policy });
  if (o.ai !== false && o.check !== false) await until('the AI is on', () => live().state === 'on', 3000);
  else await settle();
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0, ...(o.max_frames ? { max_frames: o.max_frames } : {}) });
  page.scene.exactPng = true;
  const folder = (): string => path.join(h.userData, 'captures', fs.readdirSync(path.join(h.userData, 'captures'))[0]!);
  /** What the session wrote of itself, line by line. */
  const lines = (): Array<Record<string, unknown>> => (fs.existsSync(path.join(folder(), 'live.jsonl')) ? fs.readFileSync(path.join(folder(), 'live.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : []);
  /** The display shows something else, and a sample of it is taken and kept: a frame the AI may look at. */
  const change = async (shade: number): Promise<void> => {
    page.scene.shade = shade;
    await page.review.sample();
    await page.review.pending();
    await settle();
  };
  const c = (): FakeConnector => fakes.last();
  const looks = (): Turn[] => c().looks().map((l) => l.params as unknown as Turn);
  /** A circle in ASK; with the AI on, its own request is waited for. */
  const select = async (x = 190, width = 210): Promise<void> => {
    const before = c().asks().length;
    page.press('ASK');
    page.pointer('pointerdown', 2, x, 95);
    for (const [px, py] of [[x + width, 95], [x + width, 125], [x, 125]] as const) page.pointer('pointermove', 2, px, py);
    page.pointer('pointerup', 2, x + 2, 97);
    await until('the card', () => page.review.card()?.text.includes(`Region ${x - 8},87 `) === true && page.ask().form);
    if (live().state === 'on') await until('the circle\'s own request', () => c().asks().length === before + 1 && /^Asked at/.test(page.ask().status ?? ''));
  };
  return { h, s, fakes, c, page, control, press, live, lines, change, looks, select, policy };
}

test('[synthetic connector] Start with the box ticked starts one AI session with exactly the bounds set, screen only; without it, or not signed in, nothing is started or sent, and that is said', async () => {
  const w = await app();
  const start = w.c().calls.find((x) => x.method === 'companion/start')!;
  const params = start.params as { session_id: string; capture_session_id: string; epoch: number; model: string; policy: Policy; permissions: unknown };
  assert.match(params.session_id, /^live-[0-9a-f]{16}$/);
  assert.deepEqual({ ...params, session_id: 'x', capture_session_id: 'y' }, { session_id: 'x', capture_session_id: 'y', epoch: 1, model: 'vision-model', policy: POLICY, permissions: { screen: true, microphone: false, system_audio: false } }, 'the bounds as set, the chosen model, and no audio route asked for');
  assert.equal(params.capture_session_id, path.basename(path.join(w.h.userData, 'captures', fs.readdirSync(path.join(w.h.userData, 'captures'))[0]!)));
  assert.deepEqual([w.live().state, w.live().model, w.live().max_submissions, w.live().used, w.live().reserve, w.live().seen, w.live().paused, w.live().ended], ['on', 'vision-model', 60, 0, 12, null, null, null]);
  assert.match(w.page.hint() ?? '', /ChatGPT observes this whole display as it changes: 60 of 60 requests and about 30 min left in this session \(its own bounds, not ChatGPT's quota\); it has not looked yet\./);
  assert.deepEqual(w.lines().map((l) => [l['kind'], l['model'], l['remaining_submissions']]), [['started', 'vision-model', 60]]);
  assert.equal(w.c().count('companion/turn'), 0, 'nothing is sent before a frame is kept or a circle is made');

  // The capture alone: no session is started, nothing is sent, and the toolbar and the card say so.
  const alone = await app({ ai: false });
  assert.deepEqual([alone.c().count('companion/start'), alone.live().state, alone.live().reason], [0, 'off', null]);
  assert.match(alone.page.hint() ?? '', /No AI observes this display \(the AI was not started with this capture\)\./);
  await alone.change(90);
  await alone.select();
  assert.deepEqual([alone.c().count('companion/turn'), alone.page.ask().status], [0, 'Kept on this device. The AI was not asked: the AI is not started; start it in the control window.']);
  assert.equal(alone.lines().length, 0);

  // Asked for, but not signed in (never checked): not started, with why; no connector is started for it.
  const out = await app({ check: false });
  assert.deepEqual([out.fakes.made.length, out.live().state, out.live().reason], [0, 'off', 'the ChatGPT subscription has not been checked yet (use the control window)']);
  assert.deepEqual(out.lines().map((l) => [l['kind'], l['code']]), [['not_started', 'local']]);
  // Bounds that are not this version's are refused whole, never clamped; only the control window starts anything.
  const idle = harness({ env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig() }, subscription: { spawn: fakeConnectors().spawn } });
  await started();
  const control = { sender: (idle.control() as unknown as FakeWindow).webContents };
  for (const ai of [{ policy: { ...POLICY, max_submissions: 101 } }, { policy: { ...POLICY, max_session_ms: 3_600_001 } }, { policy: { ...POLICY, min_observation_interval_ms: 100 } }, { policy: POLICY, extra: true }, { policy: { max_submissions: 12 } }, 'yes', 7]) {
    assert.deepEqual(plain(await idle.handlers['lc:start']!(control, 'screen:1:0', ai)), { ok: false, reason: 'refused' }, JSON.stringify(ai));
  }
  assert.equal(idle.current(), null);
  assert.deepEqual(plain(await w.h.handlers['lc:live-start']!({ sender: w.s.overlay.webContents }, POLICY)), { ok: false, reason: 'refused' });
  assert.deepEqual(plain(await w.h.handlers['lc:live-start']!({ sender: w.control.webContents }, { ...POLICY, max_submissions: 0 })), { ok: false, reason: 'refused' });
  assert.deepEqual(plain(await w.h.handlers['lc:live-start']!({ sender: w.control.webContents }, POLICY)), { ok: false, reason: 'the AI is already started' });
  assert.equal(w.c().count('companion/start'), 1);
});

test('[synthetic connector] a kept frame is what the AI looks at: the whole display, as an observation that asks for no answer; one at a time, the newest waits, and what it noted joins the conversation without ever being shown', async () => {
  const w = await app();
  await w.change(90);
  await until('the first look', () => w.looks().length === 1);
  const first = w.looks()[0]!;
  assert.deepEqual([first.trigger, first.allowed_assistance, first.presentation, first.user_text, first.focus, first.history, first.gaps, first.epoch, first.permission_revision], ['observation', 'none', 'none', null, null, [], [], 1, 1]);
  assert.deepEqual([first.context.frame_seq, first.context.region_px, first.context.region_dip, first.image.width, first.image.height], [1, { x: 0, y: 0, width: 1280, height: 800 }, { x: 0, y: 0, width: 1280, height: 800 }, 1280, 800], 'the whole display, never a part of it');
  assert.equal(fs.existsSync(path.join(w.h.userData, 'captures', first.context.capture_session_id, 'frames', `${first.image.sha256}.png`)), true, 'the picture it was given is the capture\'s own kept frame');
  assert.deepEqual([w.live().out, w.live().frames, w.live().seen], [1, 1, null]);
  // The display changes twice while that look is out: the newest frame waits, the older one is a gap; nothing more is sent.
  await w.change(140);
  await w.change(200);
  assert.deepEqual([w.looks().length, w.live().frames], [1, 3]);
  // The look completes: what was noted is kept for the conversation, never shown as help; the next look waits for
  // the least time between two looks, then goes with the newest frame, the gap and what was noted before.
  w.c().see('A page of notes about slopes is open.');
  await until('seen', () => w.live().seen?.frame_seq === 1);
  assert.deepEqual([w.looks().length, w.page.review.card(), w.live().used, w.live().out], [1, null, 1, 0], 'not sent before its time, and no card: an observation is never help');
  w.h.fire(30_000);
  await until('the second look', () => w.looks().length === 2);
  const second = w.looks()[1]!;
  assert.deepEqual([second.context.frame_seq, second.gaps, second.history.map((x) => [x.kind, x.text, x.frame_seq, x.presentation])], [3, [{ from_frame_seq: 2, to_frame_seq: 2, reason: 'coalesced' }], [['observation', 'A page of notes about slopes is open.', 1, 'not_presented']]]);
  assert.notEqual(second.image.sha256, first.image.sha256);
  // A circle while that look is out: the user's own request goes at once, with the same conversation; its response
  // is help, shown on its card; the look's own answer still joins the conversation.
  await w.select();
  const focus = w.c().asks()[0]!.params as unknown as Turn;
  assert.deepEqual([focus.trigger, focus.allowed_assistance, focus.user_text, focus.context.frame_seq, focus.focus?.frame_seq, focus.history.length, focus.gaps], ['focus', 'hint', null, 4, 4, 1, [{ from_frame_seq: 2, to_frame_seq: 2, reason: 'coalesced' }]]);
  w.c().answer('Look at the sign of the slope.');
  await until('shown', () => w.page.ask().answer === 'Look at the sign of the slope.');
  w.c().see('The notes now show a worked example.', w.c().looks()[1]!);
  await until('seen again', () => w.live().seen?.frame_seq === 3);
  assert.deepEqual([w.live().used, w.live().out], [3, 0]);
  // What the session wrote of itself: each look and how it ended, each gap; the texts of what was noted are there.
  assert.deepEqual(w.lines().map((l) => [l['kind'], l['frame_seq'] ?? null]), [['started', null], ['look', 1], ['gap', 2], ['looked', 1], ['look', 3], ['looked', 3]]);
  assert.deepEqual(w.lines().filter((l) => l['kind'] === 'looked').map((l) => l['text']), ['A page of notes about slopes is open.', 'The notes now show a worked example.']);
  assert.match(w.page.hint() ?? '', /57 of 60 requests .* it last looked at /);
});

test('[synthetic connector] a frame still waiting for a look when the user circles is passed by: that very request names it as a gap, and it is not looked at later', async () => {
  const w = await app();
  await w.change(90);
  await until('the first look', () => w.looks().length === 1);
  await w.change(140); // waits: a look is out
  assert.deepEqual([w.live().frames, w.looks().length], [2, 1]);
  await w.select();
  const focus = w.c().asks()[0]!.params as unknown as Turn;
  assert.deepEqual([focus.context.frame_seq, focus.gaps], [3, [{ from_frame_seq: 2, to_frame_seq: 2, reason: 'coalesced' }]], 'the request that passes the waiting frame says so itself');
  assert.deepEqual(w.lines().filter((l) => l['kind'] === 'gap').map((l) => [l['frame_seq'], l['reason']]), [[2, 'coalesced']]);
  w.c().see('Noted.');
  w.c().answer('A hint.');
  await until('shown', () => w.page.ask().answer === 'A hint.');
  w.h.fire(30_000);
  await settle();
  assert.equal(w.looks().length, 1, 'the passed frame is not looked at afterwards');
  // A request that is not sent (its record cannot be written) passes nothing: the waiting frame still waits, and no gap is said for it.
  await w.change(200);
  assert.equal(w.looks().length, 2);
  await w.change(230); // waits: the second look is out
  w.h.failWrites.only = 'asks';
  w.page.question('And then?');
  w.page.click('askSubmit');
  await until('not sent', () => /^Not sent: /.test(w.page.ask().status ?? ''));
  w.h.failWrites.only = null;
  assert.deepEqual([w.c().asks().length, w.lines().filter((l) => l['kind'] === 'gap' && l['reason'] === 'coalesced').length], [1, 1]);
  w.c().see('Noted again.', w.c().looks()[1]!);
  w.h.fire(30_000);
  await until('the waiting frame is looked at', () => w.looks().length === 3);
  assert.equal(w.looks()[2]!.context.frame_seq, 5);
});

test('[synthetic connector] a circle that cannot be asked, and a follow-up that cannot be written, are frames the AI was not given: each a gap, named in the next request; later gaps are never said about an earlier frame', async () => {
  const w = await app({ policy: { max_submissions: 10, max_session_ms: 600_000, min_observation_interval_ms: 500 } });
  // Eight looks use the requests open to them (the last two are the user's).
  for (let i = 1; i <= 8; i += 1) {
    await w.change(20 + i * 20);
    w.h.fire(500);
    await until(`look ${i}`, () => w.looks().length === i);
    w.c().see(`Noted ${i}.`);
    await until(`seen ${i}`, () => w.live().used === i);
  }
  await w.select(); // frame 9: the circle's own request
  const circle = w.c().asks()[0]!.params as unknown as Turn;
  w.c().answer('A hint.');
  await until('shown', () => w.page.ask().answer === 'A hint.');
  // The screen changes: the frame is taken, not looked at (the reserve), so it is a later gap. A follow-up with the
  // circle's own picture back on the screen and nothing newer SENT is still the circle's frame: it says nothing of
  // the later gap.
  await w.change(250);
  w.h.fire(500);
  await settle();
  assert.deepEqual([w.looks().length, w.live().frames, w.live().paused !== null], [8, 10, true]);
  w.page.scene.shade = 180; // back to what the circle saw (no sample is kept of it)
  w.page.review.frame({ bitmap: { width: 1280, height: 800, shade: 180, close() {} } as never, seq: 99, at: '2026-09-30T12:00:09.000Z', presented: 99, presentedAt: performance.now() });
  w.page.question('And why?');
  w.page.click('askSubmit');
  await until('sent', () => w.c().asks().length === 2);
  const same = w.c().asks()[1]!.params as unknown as Turn;
  assert.deepEqual([same.context.frame_seq, same.focus, same.gaps.every((g) => g.to_frame_seq <= same.context.frame_seq)], [circle.context.frame_seq, circle.focus, true]);
  w.c().answer('Because.');
  await until('shown', () => w.page.ask().answer === 'Because.');
  assert.deepEqual([w.live().state, w.live().used], ['used_up', 10]);
  // Every request is used: a new circle is kept, not asked, and its frame is a gap of the session.
  await w.select(600, 120);
  assert.match(w.page.ask().status ?? '', /^Kept on this device\. The AI was not asked: all of this AI session's requests are used; start the AI again in the control window\.$/);
  assert.deepEqual([w.c().asks().length, w.live().frames, w.lines().filter((l) => l['kind'] === 'gap').map((l) => [l['frame_seq'], l['reason']])], [2, 11, [[10, 'budget'], [11, 'not_observed']]]);
});

test('[synthetic connector] a follow-up is about the circle\'s own frame only when it is that very picture and nothing newer was sent; a follow-up that cannot be written passes nothing and is a gap; the conversation that no longer fits is said as left out', async () => {
  // Nothing newer was sent, but the picture is another one: a later frame.
  let w = await app();
  await w.change(90);
  await until('a look', () => w.looks().length === 1); // stays out: the frames after it wait
  await w.select();
  const circle = w.c().asks()[0]!.params as unknown as Turn;
  w.c().answer('A hint.');
  await until('shown', () => w.page.ask().answer === 'A hint.');
  await w.change(140); // waits behind the look that is out: taken, not sent
  w.page.question('And now?');
  w.page.click('askSubmit');
  await until('sent', () => w.c().asks().length === 2);
  const other = w.c().asks()[1]!.params as unknown as Turn;
  assert.deepEqual([other.focus, other.context.frame_seq > circle.context.frame_seq, other.image.sha256 !== circle.image.sha256, other.gaps.at(-1)], [null, true, true, { from_frame_seq: 3, to_frame_seq: 3, reason: 'coalesced' }]);
  // The circle's own picture is back on the screen, but a newer frame was sent meanwhile: a later frame too.
  w = await app({ policy: { ...POLICY, min_observation_interval_ms: 500 } });
  await w.select();
  const first = w.c().asks()[0]!.params as unknown as Turn;
  w.c().answer('A hint.');
  await until('shown', () => w.page.ask().answer === 'A hint.');
  await w.change(90);
  await until('a look of the changed screen', () => w.looks().length === 1);
  w.c().see('Changed.');
  await until('seen', () => w.live().seen !== null);
  await w.change(20); // as it was when the circle was made
  w.h.fire(500);
  await until('a look of the screen as before', () => w.looks().length === 2);
  w.c().see('As before.');
  await until('seen', () => w.live().used === 3);
  w.page.question('And now?');
  w.page.click('askSubmit');
  await until('sent', () => w.c().asks().length === 2);
  const back = w.c().asks()[1]!.params as unknown as Turn;
  assert.deepEqual([back.image.sha256 === first.image.sha256, back.focus, back.context.frame_seq > w.looks()[1]!.context.frame_seq, JSON.parse(back.history.at(-1)!.text).kind], [true, null, true, 'historical_focus_reference'], 'the same pixels, but not the circle\'s frame: never an older frame after a newer one');
  w.c().answer('Still a slope.');
  await until('shown', () => w.page.ask().answer === 'Still a slope.');
  // A follow-up whose record cannot be written: its picture is kept, nothing is sent, and that frame is a gap named in the next request.
  w.page.pointer('pointerdown', 1, 200, 300);
  w.page.pointer('pointermove', 1, 260, 300);
  w.page.pointer('pointerup', 1, 260, 300); // other ink, the same pixels: another frame whose picture is on this device already
  await w.page.review.pending();
  const frames = w.live().frames!;
  w.h.failWrites.only = `${path.sep}asks${path.sep}`;
  w.page.question('Not written.');
  w.page.click('askSubmit');
  await until('not sent', () => /^Not sent: the request could not be written to this device/.test(w.page.ask().status ?? ''));
  w.h.failWrites.only = null;
  assert.deepEqual([w.c().asks().length, w.live().frames, w.lines().at(-1)!['kind'], w.lines().at(-1)!['reason'], w.lines().at(-1)!['frame_seq']], [2, frames + 1, 'gap', 'not_observed', frames + 1]);
  w.page.click('askSubmit');
  await until('sent', () => w.c().asks().length === 3);
  const next = w.c().asks()[2]!.params as unknown as Turn;
  assert.deepEqual([next.context.frame_seq, next.gaps.at(-1)], [frames + 2, { from_frame_seq: frames + 1, to_frame_seq: frames + 1, reason: 'not_observed' }]);
  // After a request of the user's own ends, a frame that waited behind it is looked at.
  w = await app();
  await w.select();
  await w.change(90); // waits: the circle's request is out
  assert.equal(w.looks().length, 0);
  w.c().answer('A hint.');
  await until('the waiting frame is looked at', () => w.looks().length === 1);
  // More was said and seen than a request can carry: the newest whole entries go, and what was left out is said as a gap.
  w = await app({ policy: { max_submissions: 100, max_session_ms: 3_600_000, min_observation_interval_ms: 500 } });
  for (let i = 1; i <= 30; i += 1) {
    await w.change(10 + i * 7);
    w.h.fire(500);
    await until(`look ${i}`, () => w.looks().length === i);
    w.c().see(`Noted ${i}.`);
    await until(`seen ${i}`, () => w.live().used === i);
  }
  await w.select();
  const full = w.c().asks()[0]!.params as unknown as Turn;
  assert.deepEqual([full.history.length, full.history[0]!.text, full.history.at(-1)!.text, full.gaps], [23, 'Noted 8.', 'Noted 30.', [{ from_frame_seq: 1, to_frame_seq: 7, reason: 'budget' }]]);
});

test('[synthetic connector] unattended looks never use the requests kept for the user\'s own circles and questions; the user\'s own requests still go; when all are used the session ends, and nothing renews it', async () => {
  const w = await app({ policy: { max_submissions: 5, max_session_ms: 600_000, min_observation_interval_ms: 500 } });
  assert.equal(w.live().reserve, 1);
  // Four looks use four of the five requests.
  for (let i = 1; i <= 4; i += 1) {
    await w.change(40 + i * 30);
    w.h.fire(500);
    await until(`look ${i}`, () => w.looks().length === i);
    w.c().see(`Noted ${i}.`);
    await until(`seen ${i}`, () => w.live().used === i);
  }
  // The fifth frame is not sent: the last request is the user's. Said, with the session still on.
  await w.change(220);
  w.h.fire(500);
  await settle();
  assert.deepEqual([w.looks().length, w.live().state, w.live().paused, w.live().used], [4, 'on', 'the requests left in this session are kept for your own focus and follow-ups', 4]);
  assert.match(w.page.hint() ?? '', /ChatGPT now looks only when you circle or ask \(the requests left in this session are kept for your own focus and follow-ups\): 1 of 5 requests/);
  await w.change(250);
  assert.equal(w.looks().length, 4, 'nor any later one');
  assert.deepEqual(w.lines().filter((l) => l['kind'] === 'gap').map((l) => [l['frame_seq'], l['reason']]), [[5, 'budget'], [6, 'budget']]);
  // The user's own circle still goes, with the gaps said; it uses the last request, and the session ends there.
  await w.select();
  const focus = w.c().asks()[0]!.params as unknown as Turn;
  assert.deepEqual([focus.context.frame_seq, focus.gaps, focus.history.length], [7, [{ from_frame_seq: 5, to_frame_seq: 6, reason: 'budget' }], 4]);
  w.c().answer('The last request of this session.');
  await until('shown', () => w.page.ask().answer === 'The last request of this session.');
  // Used up, not ended: its last response stays shown; nothing more is sent in it.
  assert.deepEqual([w.live().state, w.live().ended, w.live().used, w.c().count('companion/stop')], ['used_up', null, 5, 0]);
  assert.match(w.page.hint() ?? '', /ChatGPT no longer looks or answers: all 5 requests of this session are used \(its own bound, not ChatGPT's quota\)\. Start the AI again in the control window\./);
  // Nothing is sent after that, by a frame or by a follow-up, and no session is started by itself.
  await w.change(60);
  w.page.question('And more?');
  w.page.click('askSubmit');
  await until('not sent', () => /^Not sent: all of this AI session's requests are used; start the AI again in the control window\./.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.c().count('companion/turn'), w.c().count('companion/start'), w.page.ask().answer], [5, 1, 'The last request of this session.']);
  // Only the user starts the AI again: the used-up session is stopped, and a new one starts with its own bounds, in the same capture.
  assert.deepEqual(plain(await w.press('lc:live-start', POLICY)), { ok: true });
  const starts = w.c().calls.filter((x) => x.method === 'companion/start');
  assert.deepEqual([starts.length, starts[0]!.params['session_id'] !== starts[1]!.params['session_id'], w.live().state, w.live().used, w.live().max_submissions], [2, true, 'on', 0, 60]);
  assert.deepEqual(w.c().calls.filter((x) => x.method === 'companion/stop').map((x) => x.params['session_id']), [starts[0]!.params['session_id']]);
});

test('[synthetic connector] a failure that is not simply "not taken" ends the session with its own reason and is never retried; a request merely not taken, or the session\'s own bound, does not', async () => {
  for (const [code, submission, said] of [
    ['rate_limited', 'submitted', 'ChatGPT says requests are coming too fast for now (a rate limit, not a used-up allowance)'],
    ['allowance_exhausted', 'submitted', 'ChatGPT says the account\'s allowance is used up'],
    ['ordinary_usage_not_allowed', 'not_submitted', 'ChatGPT says included usage is not allowed for this request now'],
    ['unauthenticated', 'not_submitted', 'ChatGPT is not signed in'],
    ['failed', 'unknown', 'the request failed'],
    ['some_new_code', 'submitted', 'the request failed'],
  ] as const) {
    const w = await app({ policy: { ...POLICY, min_observation_interval_ms: 500 } });
    await w.change(90);
    await until('a look', () => w.looks().length === 1);
    w.c().fail(w.c().looks()[0]!.id, code, submission);
    await until('ended', () => w.live().state === 'ended');
    assert.deepEqual([w.live().ended, w.live().used, w.c().count('companion/stop')], [`${said}; nothing more is sent by itself`, submission === 'not_submitted' ? 0 : 1, 1], code);
    assert.equal(JSON.stringify(w.live()).includes('raw message'), false);
    // Every later frame, at every later time: nothing is sent, and nothing is started.
    for (const shade of [140, 200, 250]) {
      await w.change(shade);
      w.h.fire(500);
    }
    await settle();
    assert.deepEqual([w.c().count('companion/turn'), w.c().count('companion/start')], [1, 1], `${code}: not sent again, not started again`);
    // A circle is kept, and says why the AI was not asked.
    await w.select();
    assert.match(w.page.ask().status ?? '', /^Kept on this device\. The AI was not asked: the AI session has ended \(.*; nothing more is sent by itself\); start it again in the control window\.$/);
    assert.equal(w.c().count('companion/turn'), 1);
  }
  // Not taken (the connector was busy, or a newer request replaced it): a gap in what the AI saw; the session goes on.
  const w = await app({ policy: { ...POLICY, min_observation_interval_ms: 500 } });
  await w.change(90);
  await until('a look', () => w.looks().length === 1);
  w.c().fail(w.c().looks()[0]!.id, 'busy');
  await until('not looked', () => w.live().out === 0);
  assert.deepEqual([w.live().state, w.live().used, w.live().missed, w.live().seen], ['on', 0, 'another request of yours is still waiting, so this one was not taken', null]);
  await w.change(140);
  w.h.fire(500);
  await until('the next look', () => w.looks().length === 2);
  assert.deepEqual(w.looks()[1]!.gaps, [{ from_frame_seq: 1, to_frame_seq: 1, reason: 'backpressure' }]);
  // The connector says the session's own bound for unattended looks is reached: they stop; the session is still the user's.
  w.c().fail(w.c().looks()[1]!.id, 'budget_reached');
  await until('paused', () => w.live().paused !== null);
  assert.deepEqual([w.live().state, w.live().paused, w.live().used], ['on', 'the requests left in this session are kept for your own focus and follow-ups', 0]);
  await w.change(200);
  w.h.fire(500);
  await settle();
  assert.equal(w.looks().length, 2);
  await w.select();
  assert.equal(w.c().asks().length, 1, 'the user\'s own request still goes');
});

test('[synthetic connector] the session ends at its own time, when the user stops the AI, when the connector is lost and with the capture: each said, the connector told, and nothing sent after', async () => {
  // Its own time.
  let w = await app({ policy: { max_submissions: 60, max_session_ms: 60_000, min_observation_interval_ms: 500 } });
  w.h.fire(60_000);
  await until('ended', () => w.live().state === 'ended');
  assert.deepEqual([w.live().ended, w.c().count('companion/stop')], ['this session\'s time is over', 1]);
  await w.change(90);
  assert.equal(w.c().count('companion/turn'), 0);
  // Stopped by the user, with a look out: the look is interrupted and nothing of it joins the conversation; the capture goes on.
  w = await app();
  await w.change(90);
  await until('a look', () => w.looks().length === 1);
  await w.change(140); // waits behind the look that is out
  w.h.fire(30_000); // its time has come, but one request at a time: it still waits
  await settle();
  assert.deepEqual([w.looks().length, w.live().frames], [1, 2]);
  w.press('lc:live-stop');
  await until('ended', () => w.live().state === 'ended' && w.live().out === 0);
  assert.deepEqual([w.live().ended, w.c().count('companion/stop'), w.h.current() !== null, w.live().seen], ['stopped by you', 1, true, null]);
  // The frame that was waiting is a gap (never looked at); the look that was out was not made.
  assert.deepEqual(w.lines().map((l) => [l['kind'], l['frame_seq'] ?? null, l['reason'] ?? null]), [['started', null, null], ['look', 1, null], ['gap', 2, 'not_observed'], ['ended', null, 'stopped by you'], ['settled', null, null], ['gap', 1, 'not_observed'], ['not_looked', 1, null]]);
  // The end's own line says a request was still out; how that one settled, and the count as it then is, is a line of its own.
  const lines = w.lines();
  assert.deepEqual([lines[3]!['used'], lines[3]!['out'], lines[4]!['request_id'], lines[4]!['status'], lines[4]!['submission'], lines[4]!['used'], lines[4]!['out']], [0, 1, w.looks()[0]!.request_id, 'cancelled', 'submitted', 1, 0]);
  // After its end no frame is taken for it, at any time; and its end is said once, whatever ends after it.
  await w.change(200);
  w.h.fire(30_000);
  assert.deepEqual([w.live().frames, w.looks().length], [2, 1]);
  w.press('lc:live-stop');
  w.h.fire(1_800_000); // its own time comes after it was stopped: it is not ended a second time
  assert.deepEqual([w.lines().filter((l) => l['kind'] === 'ended').length, w.live().ended, w.c().count('companion/stop')], [1, 'stopped by you', 1]);
  w.h.handlers['lc:live-stop']!({ sender: w.s.overlay.webContents }); // only the control window stops or starts it
  // The connector is lost.
  w = await app();
  w.c().exit(1);
  await until('ended', () => w.live().state === 'ended');
  assert.equal(w.live().ended, 'the connection to ChatGPT was lost');
  await w.change(90);
  await w.select();
  assert.deepEqual([w.fakes.made.length, w.c().count('companion/turn')], [1, 0], 'no connector is started by the app itself, and nothing is sent');
  // The capture's Stop ends the session with it, and a response that was out is never shown.
  w = await app();
  await w.select();
  const session = w.c().calls.find((x) => x.method === 'companion/start')!.params['session_id'];
  w.h.end('stopped by the test');
  await until('ended', () => w.h.current() === null, 5000);
  assert.deepEqual(w.c().calls.filter((x) => x.method === 'companion/stop').map((x) => x.params), [{ session_id: session, epoch: 1 }]);
  assert.deepEqual(w.lines().map((l) => [l['kind'], l['reason'] ?? null]), [['started', null], ['ended', 'the capture was stopped'], ['settled', null]], 'the circle\'s request that was out settles after the end, as a line of its own');
  assert.equal(w.page.ask().answer, null);
  // A Start whose answer is refused by the connector: not started, with the connector's fixed reason, and said.
  const refused = await app({ check: true, ai: false });
  refused.c().manual.add('companion/start');
  const starting = refused.press('lc:live-start', POLICY) as Promise<unknown>;
  await until('asked', () => refused.c().count('companion/start') === 1);
  assert.equal(refused.live().state, 'starting');
  refused.c().fail(refused.c().calls.at(-1)!.id, 'unsupported_model');
  assert.deepEqual(plain(await starting), { ok: false, reason: 'the chosen model is not available for pictures' });
  assert.deepEqual([refused.live().state, refused.live().reason], ['off', 'the chosen model is not available for pictures']);
});

test('[synthetic connector] a picture that cannot be made is said on the card: nothing is kept, nothing is sent, the ink and the mode are as they were, and nothing fails silently', async () => {
  const w = await app();
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown): void => void rejections.push(reason);
  process.on('unhandledRejection', onRejection);
  try {
    // A stroke first, so there is ink that a failed circle could harm.
    w.page.pointer('pointerdown', 1, 200, 300);
    w.page.pointer('pointermove', 1, 260, 300);
    w.page.pointer('pointerup', 1, 260, 300);
    await w.page.review.pending();
    const ink = JSON.stringify(w.page.review.state().doc.ink);
    w.page.scene.encodingFails = true;
    w.page.press('ASK');
    w.page.pointer('pointerdown', 2, 190, 95);
    for (const [px, py] of [[400, 95], [400, 125], [190, 125]] as const) w.page.pointer('pointermove', 2, px, py);
    w.page.pointer('pointerup', 2, 192, 97);
    await until('the card says it', () => /could not be made/.test(w.page.review.card()?.text ?? ''));
    await settle();
    assert.match(w.page.review.card()!.text, /^The picture of the display could not be made \(the encoder failed \(injected\)\), so this selection was not kept and nothing was sent to any AI\./);
    assert.deepEqual([w.c().count('companion/turn'), w.page.ask().form, JSON.stringify(w.page.review.state().doc.ink), /Pen writes/.test(w.page.hint() ?? '') ? 'WRITE' : 'another mode', fs.existsSync(path.join(w.h.userData, 'captures', fs.readdirSync(path.join(w.h.userData, 'captures'))[0]!, 'asks'))], [0, false, ink, 'WRITE', false]);
    // A follow-up whose picture cannot be made: not sent, said, and the card as it was.
    w.page.scene.encodingFails = false;
    await w.select();
    w.c().answer('A hint.');
    await until('shown', () => w.page.ask().answer === 'A hint.');
    w.page.scene.encodingFails = true;
    w.page.question('And why?');
    w.page.click('askSubmit');
    await until('not sent', () => /^Not sent: the picture of the display could not be made \(the encoder failed \(injected\)\)\./.test(w.page.ask().status ?? ''));
    assert.deepEqual([w.c().asks().length, w.page.ask().answer, w.page.ask().submit], [1, 'A hint.', true]);
    await settle();
    assert.deepEqual(rejections, []);
  } finally {
    process.off('unhandledRejection', onRejection);
  }
});

test('[synthetic connector] only the connector\'s output closes while it stays running: it is ended here, the session is over, what was out is not known and never sent again, and only the user\'s Check starts a connector again', async () => {
  const w = await app({ policy: { ...POLICY, min_observation_interval_ms: 500 } });
  await w.change(90);
  await until('a look', () => w.looks().length === 1);
  const first = w.c();
  first.stdout.end(); // its output closes; the process itself goes on
  assert.equal(first.exited, false);
  await until('the session is over', () => w.live().state === 'ended' && w.live().out === 0, 5000);
  const sub = (): { state?: string } => plain(w.press('lc:sub-state')) as { state?: string };
  assert.deepEqual([w.live().ended, sub().state, w.live().seen, w.live().used], ['the connection to ChatGPT was lost', 'unavailable', null, 1], 'the look that was out may have reached ChatGPT: its request is counted, never given back');
  await until('it was ended here, by the end of its input', () => first.exited, 5000);
  // Nothing is sent again, and no connector is started, by any later frame or circle.
  await w.change(150);
  w.h.fire(500);
  await w.select();
  assert.deepEqual([w.fakes.made.length, first.count('companion/turn')], [1, 1]);
  assert.match(w.page.ask().status ?? '', /^Kept on this device\. The AI was not asked: the AI session has ended /);
  // The user's own Check starts a connector again; the AI is started again only by the user.
  w.press('lc:sub-check');
  await until('checked again', () => sub().state === 'signed_in', 3000);
  assert.deepEqual([w.fakes.made.length, w.c().count('companion/start'), w.live().state], [2, 0, 'ended']);
  assert.deepEqual(plain(await w.press('lc:live-start', POLICY)), { ok: true });
  assert.deepEqual([w.c().count('companion/start'), w.c().count('companion/turn'), w.live().state], [1, 0, 'on'], 'a new session; the look that was lost is not sent again');
});

test('[synthetic connector] when the capture keeps no further frame, the AI is given none by itself: that is said as the looks having stopped, with why, in the session that runs and in one started afterwards; the user\'s own requests still go while a picture can be kept', async () => {
  const w = await app({ policy: { ...POLICY, min_observation_interval_ms: 500 }, max_frames: 2 });
  for (let i = 1; i <= 2; i += 1) {
    await w.change(40 + i * 40);
    w.h.fire(500);
    await until(`look ${i}`, () => w.looks().length === i);
    w.c().see(`Noted ${i}.`);
    await until(`seen ${i}`, () => w.live().used === i);
  }
  assert.deepEqual([w.live().state, w.live().paused], ['on', null]);
  await w.change(200); // the third frame is over the capture's cap: not kept, so not looked at
  w.h.fire(500);
  await settle();
  const WHY = 'no further frame of this capture is kept on this device (the retention limit of 2 frames for this session is reached), and only a kept frame is given to ChatGPT by itself';
  assert.deepEqual([w.looks().length, w.live().state, w.live().paused, w.lines().at(-1)!['kind'], w.lines().at(-1)!['reason']], [2, 'on', WHY, 'looks_stopped', WHY]);
  assert.match(w.page.hint() ?? '', /ChatGPT now looks only when you circle or ask \(no further frame of this capture is kept on this device /);
  // The user's own circle still goes (its picture is kept with the selection, not as a frame of the capture).
  await w.select();
  assert.equal(w.c().asks().length, 1);
  w.c().answer('A hint.');
  await until('shown', () => w.page.ask().answer === 'A hint.');
  // A session started afterwards in this capture says it from its start.
  w.press('lc:live-stop');
  assert.deepEqual(plain(await w.press('lc:live-start', POLICY)), { ok: true });
  assert.deepEqual([w.live().state, w.live().paused, w.live().used], ['on', WHY, 0]);
});

test('[synthetic connector] an interruption the connector does not confirm ends the session, with that said; the connector\'s own bound for looks stops them and the frame that waited is not sent either; a frame taken before the AI was started is not looked at', async () => {
  // The user cancels a circle's request; the connector cannot confirm that ChatGPT stopped: it stops its session, and so does the app.
  let w = await app({ configure: (c) => void (c.onCancel = 'unconfirmed') });
  await w.select();
  w.page.click('askCancel');
  await until('ended', () => w.live().state === 'ended');
  assert.deepEqual([w.live().ended, w.live().used, w.c().count('companion/interrupt')], ['a request was interrupted, and whether ChatGPT stopped working on it is not confirmed; nothing more is sent by itself', 1, 1]);
  await until('said on the card', () => /^Cancelled: no answer is shown\. Whether ChatGPT stopped working on it is not confirmed/.test(w.page.ask().status ?? ''));
  await w.change(90);
  assert.equal(w.c().count('companion/turn'), 1, 'nothing is sent by itself after that');
  // A circle while a look is out, and the connector cannot confirm that it interrupted the look: it stops its
  // session and refuses the circle's request before it reached ChatGPT. Said as that (the user cancelled nothing),
  // and the session is over at once: nothing is sent on the next frame.
  w = await app();
  await w.change(90);
  await until('a look', () => w.looks().length === 1);
  await w.select();
  w.c().fail(w.c().asks()[0]!.id, 'interrupt_unconfirmed', 'not_submitted');
  w.c().fail(w.c().looks()[0]!.id, 'stale_context', 'submitted');
  await until('ended', () => w.live().state === 'ended' && w.live().out === 0);
  assert.deepEqual([w.live().ended, w.live().used, w.page.ask().status], ['an interruption was not confirmed by ChatGPT, so the AI session was stopped; nothing more is sent by itself', 1, 'No answer: an interruption was not confirmed by ChatGPT, so the AI session was stopped. It did not reach ChatGPT; it is not sent again.']);
  await w.change(170);
  assert.deepEqual([w.c().count('companion/turn'), w.c().count('companion/stop')], [2, 1]);
  assert.deepEqual(plain(await w.press('lc:live-start', POLICY)), { ok: true }, 'the user can start the AI again');
  // An interruption that IS confirmed leaves the session as it was.
  w = await app();
  await w.select();
  w.page.click('askCancel');
  await until('said on the card', () => w.page.ask().status === 'Cancelled: no answer is shown.');
  assert.deepEqual([w.live().state, w.live().ended], ['on', null]);
  // The connector says the session's own bound for unattended looks is reached while another frame waits: the
  // looks stop there, and the waiting frame is not sent after it either.
  w = await app({ policy: { ...POLICY, min_observation_interval_ms: 500 } });
  await w.change(90);
  await until('a look', () => w.looks().length === 1);
  await w.change(140); // waits behind it
  w.c().fail(w.c().looks()[0]!.id, 'budget_reached');
  await until('paused', () => w.live().paused !== null);
  w.h.fire(500);
  await settle();
  assert.deepEqual([w.looks().length, w.live().state, w.lines().filter((l) => l['kind'] === 'gap').map((l) => [l['frame_seq'], l['reason']])], [1, 'on', [[1, 'budget'], [2, 'budget']]]);
  // A frame taken before the user started the AI (its picture still being made then) is not this session's to look at.
  w = await app({ ai: false });
  let release = (): void => undefined;
  w.page.encoding.gate = new Promise<void>((r) => (release = r));
  w.page.scene.shade = 90;
  await w.page.review.sample(); // taken now; its picture is held back
  await settle();
  assert.deepEqual(plain(await w.press('lc:live-start', POLICY)), { ok: true });
  w.page.encoding.gate = null;
  release();
  await w.page.review.pending();
  await settle();
  assert.deepEqual([w.looks().length, w.live().frames, w.live().state], [0, 0, 'on'], 'kept on this device, not given to the AI, and not a frame of its session');
  await w.change(150); // taken after the start
  await until('a look', () => w.looks().length === 1);
});

test('[synthetic connector] the session\'s own record: a line cut short by a failed write is cut back before the next one, the lines that could not be written are counted and said (after the capture\'s end too), and nothing is sent again for them', async () => {
  const w = await app({ policy: { ...POLICY, min_observation_interval_ms: 500 } });
  w.h.failWrites.only = 'live.jsonl';
  w.h.failWrites.partialAppend = 25; // the session's next line is cut short: 25 bytes of it reach the file
  await w.change(90);
  await until('a look', () => w.looks().length === 1);
  const file = path.join(w.h.userData, 'captures', w.looks()[0]!.context.capture_session_id, 'live.jsonl');
  assert.equal(fs.readFileSync(file, 'utf8').split('\n').at(-1)!.length, 25, 'the torn line is on the device for now');
  assert.deepEqual([w.live().unwritten, w.live().state], [1, 'on']);
  w.c().see('Noted.');
  await until('seen', () => w.live().seen !== null);
  // The next line is whole, and every line reads back: the torn part was cut away first.
  assert.deepEqual(w.lines().map((l) => l['kind']), ['started', 'looked']);
  assert.equal(w.c().count('companion/turn'), 1, 'the look itself was sent once, whatever became of its line');
  // The end's own line cannot be written: said where the capture's end is said.
  w.h.failWrites.partialAppend = 10;
  w.h.end('stopped by the test');
  await until('ended', () => w.h.current() === null, 5000);
  const state = plain(w.press('lc:session-state')) as { running: boolean; live_unwritten?: number };
  assert.deepEqual([state.running, state.live_unwritten], [false, 2]);
  assert.deepEqual(fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(0, 2).map((l) => (JSON.parse(l) as { kind: string }).kind), ['started', 'looked']);
});

test('[synthetic connector] Start the AI on a used-up session that is then refused says the refusal, not a new session; a request of the user\'s own that was sent and not taken is a frame the AI was not given, until it is answered', async () => {
  let w = await app({ policy: { max_submissions: 1, max_session_ms: 600_000, min_observation_interval_ms: 500 } });
  await w.select();
  w.c().answer('The only request.');
  await until('shown', () => w.page.ask().answer === 'The only request.');
  assert.equal(w.live().state, 'used_up');
  w.c().manual.add('companion/start');
  const starting = w.press('lc:live-start', POLICY) as Promise<unknown>;
  await until('asked', () => w.c().count('companion/start') === 2);
  w.c().fail(w.c().calls.at(-1)!.id, 'busy');
  assert.deepEqual(plain(await starting), { ok: false, reason: 'the connector is busy (a sign-in is pending in it, or an earlier request is still being ended), so the AI was not started; try again in a moment' });
  assert.deepEqual([w.live().state, w.live().reason], ['off', 'the connector is busy (a sign-in is pending in it, or an earlier request is still being ended), so the AI was not started; try again in a moment'], 'said as not started, with why: never as a new session');
  assert.deepEqual(w.lines().slice(-2).map((l) => [l['kind'], l['reason']]), [['ended', 'all of its requests were used, and you started the AI again'], ['not_started', 'the connector is busy (a sign-in is pending in it, or an earlier request is still being ended), so the AI was not started; try again in a moment']]);
  // A circle's own request that the connector does not take (busy): its frame was not given to the AI. The next
  // request says so; once a request about that very frame is answered, it is no gap any more.
  w = await app();
  await w.select();
  const circle = w.c().asks()[0]!.params as unknown as Turn;
  w.c().fail(w.c().asks()[0]!.id, 'busy');
  await until('refused', () => /^No answer/.test(w.page.ask().status ?? ''));
  assert.deepEqual(w.lines().filter((l) => l['kind'] === 'gap').map((l) => [l['frame_seq'], l['reason']]), [[circle.context.frame_seq, 'backpressure']]);
  w.page.question('Then tell me in words.');
  w.page.click('askSubmit');
  await until('sent', () => w.c().asks().length === 2);
  const again = w.c().asks()[1]!.params as unknown as Turn;
  // (the same picture, the circle's own frame: it is this request's frame, so it is not said as a gap of itself)
  assert.deepEqual([again.context.frame_seq, again.focus, again.gaps], [circle.context.frame_seq, circle.focus, []]);
  w.c().answer('In words.');
  await until('shown', () => w.page.ask().answer === 'In words.');
  await w.change(90);
  await until('a look', () => w.looks().length === 1);
  assert.deepEqual(w.looks()[0]!.gaps, [], 'answered since: the AI was given that frame');
});

test('[synthetic connector] Cancel pressed while a follow-up\'s picture is still being made: nothing leaves the window, and it is said; a refusal says whether the request had reached ChatGPT; while the earlier response stays shown, which picture it is about stays said', async () => {
  const w = await app();
  await w.select();
  w.c().answer('A hint.');
  await until('shown', () => w.page.ask().answer === 'A hint.');
  const about = w.page.ask().status!;
  assert.match(about, /^From ChatGPT \(vision-model\) in 1\.2 s, about the whole display as it was at /);
  let release = (): void => undefined;
  w.page.encoding.gate = new Promise<void>((r) => (release = r)); // the follow-up's picture is held
  w.page.question('And why?');
  w.page.click('askSubmit');
  await settle();
  assert.equal(w.page.ask().cancel, true, 'Cancel is offered while it is being made');
  w.page.click('askCancel');
  w.page.encoding.gate = null;
  release();
  await until('not sent', () => /^Not sent: you cancelled it before it was sent\./.test(w.page.ask().status ?? ''));
  await settle();
  assert.deepEqual([w.c().asks().length, w.c().count('companion/interrupt'), w.page.ask().answer, w.page.ask().submit], [1, 0, 'A hint.', true], 'never sent, so nothing to interrupt');
  assert.equal(w.page.ask().status, `Not sent: you cancelled it before it was sent. The response still shown is the one before: ${about}`);
  // A refusal says whether the request had reached ChatGPT, in the connector's own word.
  for (const [submission, said] of [['not_submitted', 'It did not reach ChatGPT'], ['submitted', 'It had reached ChatGPT'], ['unknown', 'Whether it reached ChatGPT is not known']] as const) {
    const x = await app();
    await x.select();
    x.c().fail(x.c().asks()[0]!.id, submission === 'unknown' ? 'failed' : 'busy', submission);
    await until('refused', () => /^No answer/.test(x.page.ask().status ?? ''));
    assert.match(x.page.ask().status ?? '', new RegExp(`^No answer: .*\\. ${said}; it is not sent again\\.$`), submission);
  }
});

test('[synthetic connector] a long session: every look has a request id of its own, a request never carries more gaps than the envelope takes (the newest), and a capture that ends while the AI is being started never uses that session', async () => {
  const w = await app({ policy: { max_submissions: 100, max_session_ms: 3_600_000, min_observation_interval_ms: 500 } });
  await w.change(13);
  await until('look 1', () => w.looks().length === 1);
  for (let i = 2; i <= 70; i += 1) {
    await w.change((i * 53) % 256); // waits behind the look that is out
    await w.change((i * 53 + 97) % 256); // replaces it: the frame before is a gap of its own
    w.c().see(`Noted ${i - 1}.`, w.c().looks()[i - 2]!);
    await until(`seen ${i - 1}`, () => w.live().used === i - 1);
    w.h.fire(500);
    await until(`look ${i}`, () => w.looks().length === i);
  }
  assert.equal(w.lines().filter((l) => l['kind'] === 'gap').length, 69);
  const last = w.looks().at(-1)!;
  assert.deepEqual([last.gaps.length <= 64, last.gaps.at(-1)!.to_frame_seq < last.context.frame_seq, last.gaps.every((g) => g.to_frame_seq < last.context.frame_seq), w.live().missed], [true, true, true, null]);
  assert.equal(last.gaps.filter((g) => g.reason === 'coalesced').at(-1)!.from_frame_seq, last.context.frame_seq - 1, 'the newest gaps are the ones carried');
  assert.equal(new Set(w.looks().map((l) => l.request_id)).size, 70, 'each look is a request of its own');
  // The capture is stopped while the AI's Start is still out: when the Start is answered, that session is stopped and never used.
  const x = await app({ ai: false });
  x.c().manual.add('companion/start');
  const starting = x.press('lc:live-start', POLICY) as Promise<unknown>;
  await until('asked', () => x.c().count('companion/start') === 1);
  x.h.end('stopped by the test');
  await until('ended', () => x.h.current() === null, 5000);
  const start = x.c().calls.find((c) => c.method === 'companion/start')!;
  x.c().reply(start.id, { session_id: start.params['session_id'], epoch: 1, remaining_submissions: 60, expires_in_ms: 1_800_000 });
  await starting;
  await until('that session is stopped', () => x.c().count('companion/stop') === 1);
  assert.deepEqual([x.c().calls.at(-1)!.params, x.c().count('companion/turn')], [{ session_id: start.params['session_id'], epoch: 1 }, 0]);
});

// ---- the released contract and Learning's own preparation, in Python (when a Backend checkout is given) --------------
const BACKEND = process.env['LC_BACKEND_ROOT'];
const PYTHON = process.env['LC_PYTHON'];
const contract = Boolean(BACKEND && PYTHON && fs.existsSync(path.join(BACKEND, 'packages', 'contracts', 'live_companion', 'focus.py')));

test('[synthetic connector] a follow-up on the same unchanged frame keeps the circle as its focus; after the screen changed the circle stays on its own frame and is only named, without its pixels; [released contract, Python] every line the app wrote to the connector is the contract\'s', async () => {
  const w = await app({ policy: { ...POLICY, min_observation_interval_ms: 500 } });
  await w.change(90);
  await until('a look', () => w.looks().length === 1);
  w.c().see('A worked example about slopes is on the screen.');
  await until('seen', () => w.live().seen !== null);
  await w.select();
  const circle = w.c().asks()[0]!.params as unknown as Turn;
  w.c().answer('Look at the sign of the slope.');
  await until('shown', () => w.page.ask().answer === 'Look at the sign of the slope.');
  assert.match(w.page.ask().status ?? '', /^From ChatGPT \(vision-model\) in 1\.2 s, about the whole display as it was at .*\.$/);
  // The same picture and ink, nothing newer sent since: the same frame, with the circle still its focus, and the
  // first response in the conversation as shown (the circle itself has no words of the user's).
  w.page.choose('explain');
  w.page.question('Why does the sign matter?');
  w.page.click('askSubmit');
  await until('sent', () => w.c().asks().length === 2);
  const same = w.c().asks()[1]!.params as unknown as Turn;
  assert.deepEqual([same.trigger, same.user_text, same.allowed_assistance, same.context, same.image.sha256, same.focus], ['text_followup', 'Why does the sign matter?', 'explain', circle.context, circle.image.sha256, circle.focus]);
  assert.deepEqual(same.history.map((x) => [x.kind, x.text, x.presentation, x.request_id]), [['observation', 'A worked example about slopes is on the screen.', 'not_presented', w.looks()[0]!.request_id], ['assistant', 'Look at the sign of the slope.', 'shown', circle.request_id]]);
  w.c().answer('Because it says whether the line rises.');
  await until('shown', () => w.page.ask().answer === 'Because it says whether the line rises.');
  // The screen changes (a new frame is kept, and looked at): a follow-up now is about a LATER frame. The circle is
  // not moved onto it: the focus is null, and one entry names the earlier focus and says its pixels are not attached.
  await w.change(170);
  w.h.fire(500);
  await until('a second look', () => w.looks().length === 2);
  w.c().see('The page was scrolled to the next problem.');
  await until('seen', () => w.live().seen?.frame_seq === w.looks()[1]!.context.frame_seq);
  w.page.question('And this one?');
  w.page.click('askSubmit');
  await until('sent', () => w.c().asks().length === 3);
  const later = w.c().asks()[2]!.params as unknown as Turn;
  assert.deepEqual([later.trigger, later.focus, later.context.frame_seq > w.looks()[1]!.context.frame_seq, later.image.sha256 !== circle.image.sha256, later.allowed_assistance], ['text_followup', null, true, true, 'explain']);
  const named = JSON.parse(later.history.at(-1)!.text) as Record<string, unknown>;
  assert.deepEqual([later.history.at(-1)!.kind, later.history.at(-1)!.frame_seq, named['kind'], named['pixels_attached_to_this_request'], named['provider_retention'], named['focus'], named['request_id']], ['observation', circle.context.frame_seq, 'historical_focus_reference', false, 'unverified', circle.focus, circle.request_id]);
  assert.deepEqual(later.history.slice(0, -1).map((x) => [x.kind, x.presentation]), [['observation', 'not_presented'], ['assistant', 'shown'], ['user', null], ['assistant', 'shown'], ['observation', 'not_presented']], 'what was asked, answered and seen since, in order');
  w.c().answer('This one asks for the intercept.');
  await until('shown', () => w.page.ask().answer === 'This one asks for the intercept.');
  assert.match(w.page.ask().status ?? '', /The screen had changed since your circle: ChatGPT was told where the circle was, without its pixels\.$/);
  // The record keeps, for each request, the frame it was about and where the circle was in relation to it.
  const dir = path.join(w.h.userData, 'captures', circle.context.capture_session_id, 'asks');
  const record = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.json'))!), 'utf8')) as { format: string; focus: unknown; context: unknown; requests: Array<{ trigger: string; question: string | null; assistance: string; frame: { frame_seq: number; focus: string; image: { file: string; sha256: string } }; submission: string; shown: boolean }> };
  assert.deepEqual([record.format, record.focus, record.context], ['lc-windows-live-focus/v1', circle.focus, circle.context]);
  assert.deepEqual(record.requests.map((r) => [r.trigger, r.question, r.assistance, r.frame.frame_seq, r.frame.focus, r.submission, r.shown]), [
    ['focus', null, 'hint', circle.context.frame_seq, 'on_this_frame', 'submitted', true],
    ['text_followup', 'Why does the sign matter?', 'explain', circle.context.frame_seq, 'on_this_frame', 'submitted', true],
    ['text_followup', 'And this one?', 'explain', later.context.frame_seq, 'on_an_earlier_frame', 'submitted', true],
  ]);
  for (const r of record.requests) assert.equal(fs.existsSync(path.join(dir, '..', r.frame.image.file)), true, 'each request\'s whole picture is kept');
  w.press('lc:live-stop');
  await until('ended', () => w.live().state === 'ended');
  if (!contract) return;
  // Every request line of this session, as it was written, given to the released contract; and every turn to Learning's own preparation.
  const calls = w.c().calls.map((x) => ({ version: LIVE_VERSION, id: x.id, method: x.method, params: x.params }));
  assert.deepEqual([...new Set(calls.map((x) => x.method))].sort(), ['companion/start', 'companion/stop', 'companion/turn', 'connection/read']);
  const r = spawnSync(PYTHON!, ['-B', '-c', `
import json, sys
from packages.contracts.live_companion import validate_request
from services.learning.live_session import prepare_live_session_context
out = []
for m in json.load(sys.stdin):
    try:
        validate_request(m)
        if m["method"] == "companion/turn":
            p = prepare_live_session_context(m["params"])
            out.append([m["params"]["trigger"], p["response_allowed"], len(p["image_bytes"]) > 0])
        else:
            out.append(None)
    except Exception as exc:
        out.append(str(exc)[:300])
json.dump(out, sys.stdout)
`], { cwd: BACKEND!, input: JSON.stringify(calls), encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, maxBuffer: 256 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr.slice(-2000));
  assert.deepEqual((JSON.parse(r.stdout) as unknown[]).filter((x) => x !== null), [['observation', false, true], ['focus', true, true], ['text_followup', true, true], ['observation', false, true], ['text_followup', true, true]], 'each turn is accepted and prepared: an observation allows no response, the user\'s own requests do');
});

test('[synthetic connector] an AI started on a screen that then does not change is still given its first look: a picture taken after that Start, kept, and looked at once; never one from before it; and the same at every later Start', async () => {
  const policy: Policy = { ...POLICY, min_observation_interval_ms: 500 };
  const w = await app({ ai: false, policy });
  const overlay = { sender: w.s.overlay.webContents };
  const frames = (): string[] => fs.readdirSync(path.join(w.h.userData, 'captures', fs.readdirSync(path.join(w.h.userData, 'captures'))[0]!, 'frames')).sort();
  /** A sample with no new frame of the stream (the screen is still). */
  const still = async (): Promise<void> => {
    await w.page.review.sameFrameLate(0);
    await w.page.review.pending();
    await settle();
  };
  // What the overlay offers as a first picture, as it crosses to the main process.
  const offered: unknown[][] = [];
  const take = w.h.handlers['lc:look-frame']!;
  w.h.handlers['lc:look-frame'] = (e: unknown, ...args: unknown[]) => {
    offered.push(args);
    return take(e, ...args);
  };
  // The capture alone: the screen is kept once, and no AI is there to look at it.
  await w.change(90);
  await still();
  assert.deepEqual([w.page.review.retention().retained, frames().length, offered.length, w.c().count('companion/turn')], [1, 1, 0, 0]);
  const kept = frames()[0]!;
  // The AI is started. Nothing on the screen changes, and the stream presents no new frame.
  assert.deepEqual(plain(await w.press('lc:live-start', policy)), { ok: true });
  const since = Date.parse(w.live().since!);
  assert.equal(w.looks().length, 0, 'nothing kept from before the Start is given to it');
  await still();
  await until('the first look', () => w.looks().length === 1);
  const first = w.looks()[0]!;
  assert.deepEqual([first.trigger, first.context.frame_seq, first.allowed_assistance, first.presentation, first.focus, first.user_text], ['observation', 1, 'none', 'none', null, null]);
  const at = (t: Turn): number => Date.parse(t.context.frame_captured_at!);
  assert.ok(at(first) >= since, 'taken after the Start: the picture held from before it was taken anew');
  // It is the picture already kept (the same bytes at their address): nothing is written twice, and the capture's
  // own record of the display has no new step.
  assert.deepEqual([frames(), `${first.image.sha256}.png`, w.page.review.retention().retained], [[kept], kept, 1]);
  const look = w.lines().find((l) => l['kind'] === 'look')!;
  assert.deepEqual([look['frame_seq'], (look['image'] as { file: string }).file, look['frame_captured_at']], [1, `frames/${kept}`, first.context.frame_captured_at]);
  // Offered once: the samples that follow on the still screen offer nothing and are not looked at.
  w.c().see('A page of notes.');
  await until('looked', () => w.live().seen?.frame_seq === 1);
  for (let i = 0; i < 3; i += 1) await still();
  await w.change(90);
  w.h.fire(500);
  await settle();
  assert.deepEqual([offered.length, w.looks().length, w.live().frames, w.live().used], [1, 1, 1, 1]);
  // The screen changes: that frame is kept as a step, and looked at as before (one at a time, in its turn).
  await w.change(140);
  await until('the second look', () => w.looks().length === 2);
  assert.deepEqual([w.looks()[1]!.context.frame_seq, offered.length, w.page.review.retention().retained], [2, 1, 2]);
  w.c().see('The notes moved on.');
  await until('looked', () => w.live().seen?.frame_seq === 2);

  // Stopped and started again, the screen still as it was: the new session is given a picture taken after ITS Start.
  w.press('lc:live-stop');
  await until('stopped', () => w.live().state === 'ended');
  await still();
  assert.equal(offered.length, 1, 'no AI: nothing is offered');
  await new Promise((later) => setTimeout(later, 5)); // (the clock moves on: the first session's picture is from before this Start)
  assert.deepEqual(plain(await w.press('lc:live-start', policy)), { ok: true });
  const again = Date.parse(w.live().since!);
  // The picture offered to the session before is not this one's: the main process itself refuses it, and asks for another.
  assert.deepEqual(plain(await take(overlay, ...offered[0]!)), { ok: false, retry: true });
  await still();
  await until('the new session\'s first look', () => w.looks().length === 3);
  const third = w.looks()[2]!;
  assert.ok(at(third) >= again && third.session_id !== first.session_id);
  assert.deepEqual([third.context.frame_seq, third.trigger, w.live().frames], [1, 'observation', 1]);
  // Only the overlay offers one; with a frame of its own the session takes no other; a malformed one is said and not taken.
  assert.deepEqual(plain(await take({ sender: w.control.webContents }, ...offered[0]!)), { ok: false });
  assert.deepEqual(plain(await take(overlay, ...offered.at(-1)!)), { ok: true });
  assert.equal(w.looks().length, 3);
  w.press('lc:live-stop');
  assert.deepEqual(plain(await take(overlay, ...offered.at(-1)!)), { ok: false }, 'no session: nothing is taken');
});

test('[synthetic connector] the first look is one look: a frame kept anyway after the Start is that look and nothing is offered beside it; with the looks stopped none is taken; a first picture that cannot be read is said', async () => {
  const policy: Policy = { ...POLICY, min_observation_interval_ms: 500 };
  // The screen changes right after the AI was started: the kept frame is the first look, and the only one.
  const w = await app({ ai: false, policy });
  let offered = 0;
  const take = w.h.handlers['lc:look-frame']!;
  w.h.handlers['lc:look-frame'] = (e: unknown, ...args: unknown[]) => {
    offered += 1;
    return take(e, ...args);
  };
  await w.change(90);
  assert.deepEqual(plain(await w.press('lc:live-start', policy)), { ok: true });
  await w.change(140);
  await until('the first look', () => w.looks().length === 1);
  await w.change(140);
  await w.change(140);
  w.h.fire(500);
  await settle();
  assert.deepEqual([offered, w.looks().length, w.live().frames, w.page.review.retention().retained], [0, 1, 1, 2]);

  // Started with the capture, as usual: the first kept frame is the first look (nothing is offered beside it).
  const usual = await app({ policy });
  let beside = 0;
  const usualTake = usual.h.handlers['lc:look-frame']!;
  usual.h.handlers['lc:look-frame'] = (e: unknown, ...args: unknown[]) => {
    beside += 1;
    return usualTake(e, ...args);
  };
  await usual.change(90);
  await usual.change(90);
  await until('the first look', () => usual.looks().length === 1);
  assert.deepEqual([beside, usual.live().frames], [0, 1]);

  // The capture keeps no further frame: the AI's looks are stopped (said), and no first picture is taken either.
  const full = await app({ ai: false, policy, max_frames: 1 });
  await full.change(90);
  await full.change(140); // (refused: the limit; the capture keeps nothing more)
  assert.deepEqual(plain(await full.press('lc:live-start', policy)), { ok: true });
  assert.match(full.live().paused ?? '', /^no further frame of this capture is kept on this device/);
  await full.change(140);
  await full.change(200);
  await settle();
  assert.deepEqual([full.looks().length, full.live().frames], [0, 0]);

  // A first picture that is not a picture of this display: said as the look that was not made, never sent.
  const bad = await app({ ai: false, policy });
  await bad.change(90);
  assert.deepEqual(plain(await bad.press('lc:live-start', policy)), { ok: true });
  const overlay = { sender: bad.s.overlay.webContents };
  assert.deepEqual(plain(await bad.h.handlers['lc:look-frame']!(overlay, null, new Uint8Array(4), null)), { ok: false });
  assert.equal(bad.live().missed, 'the first picture\'s facts are malformed');
  assert.deepEqual(plain(await bad.h.handlers['lc:look-frame']!(overlay, { frame_seq: 1, frame_captured_at: new Date().toISOString(), frame_width: 1280, frame_height: 800, ink_session: '0'.repeat(16), ink_revision: 0, visible_strokes: 0 }, new Uint8Array(4), null)), { ok: false });
  assert.equal(bad.live().missed, 'the first picture\'s facts are malformed', 'how the picture relates to the stream must be said with it');
  assert.deepEqual(plain(await bad.h.handlers['lc:look-frame']!(overlay, { frame_seq: 1, frame_captured_at: new Date().toISOString(), frame_width: 1280, frame_height: 800, ink_session: '0'.repeat(16), ink_revision: 0, visible_strokes: 0, stream_new_frame: false, stream_frame_age_ms: 12 }, new Uint8Array(4), null)), { ok: false });
  assert.match(bad.live().missed ?? '', /^the display's picture is /);
  assert.deepEqual([bad.looks().length, bad.live().frames], [0, 0]);
});

test('[synthetic connector] the first look is owed until a picture was taken for the AI by itself: a circle made first does not stand in for it; a picture that cannot be kept or made is said and not tried without end; what was kept is named in the session\'s record with how it relates to the stream', async () => {
  const policy: Policy = { ...POLICY, min_observation_interval_ms: 500 };
  const still = async (w: Awaited<ReturnType<typeof app>>): Promise<void> => {
    await w.page.review.sameFrameLate(0);
    await w.page.review.pending();
    await settle();
  };
  const counted = (w: Awaited<ReturnType<typeof app>>): { n: number } => {
    const offered = { n: 0 };
    const take = w.h.handlers['lc:look-frame']!;
    w.h.handlers['lc:look-frame'] = (e: unknown, ...args: unknown[]) => {
      offered.n += 1;
      return take(e, ...args);
    };
    return offered;
  };
  const frames = (w: Awaited<ReturnType<typeof app>>): string[] => fs.readdirSync(path.join(w.h.userData, 'captures', fs.readdirSync(path.join(w.h.userData, 'captures'))[0]!, 'frames')).sort();

  // The user circles before the first sample after the Start: the circle's own request goes with the frame it was
  // made on (taken before the Start, and said as that). The session's first look is still owed, and is made after it.
  const w = await app({ ai: false, policy });
  await w.change(90);
  assert.deepEqual(plain(await w.press('lc:live-start', policy)), { ok: true });
  const since = Date.parse(w.live().since!);
  await w.select();
  const focus = w.c().asks()[0]!.params as unknown as Turn;
  assert.ok(Date.parse(focus.context.frame_captured_at!) < since && focus.context.frame_seq === 1, 'the circle is about the frame it was drawn on');
  await still(w);
  assert.equal(w.looks().length, 0, 'one request at a time: the look waits for the circle\'s');
  w.c().answer('A hint.');
  await until('the first look', () => w.looks().length === 1);
  assert.ok(Date.parse(w.looks()[0]!.context.frame_captured_at!) >= since && w.looks()[0]!.context.frame_seq === 2);
  // Its record: the picture that was kept, named before the look, with how it relates to the stream (no new frame
  // was presented: the stream's newest frame read again, with its age).
  const first = w.lines().find((l) => l['kind'] === 'first_picture')!;
  assert.deepEqual([first['frame_seq'], first['stream_new_frame'], typeof first['stream_frame_age_ms'], fs.existsSync(path.join(w.h.userData, 'captures', fs.readdirSync(path.join(w.h.userData, 'captures'))[0]!, (first['image'] as { file: string }).file))], [2, false, 'number', true]);
  assert.deepEqual(w.lines().filter((l) => ['first_picture', 'look'].includes(l['kind'] as string)).map((l) => [l['kind'], l['frame_seq'], (l['image'] as { sha256: string }).sha256]), [['first_picture', 2, w.looks()[0]!.image.sha256], ['look', 2, w.looks()[0]!.image.sha256]]);
  // A circle that was cancelled leaves the look owed too (the session would else have seen nothing).
  const x = await app({ ai: false, policy });
  await x.change(90);
  assert.deepEqual(plain(await x.press('lc:live-start', policy)), { ok: true });
  await x.select();
  x.page.click('askCancel');
  await until('cancelled', () => /^Cancelled/.test(x.page.ask().status ?? ''));
  await still(x);
  await until('the first look', () => x.looks().length === 1);
  // With a new frame of the stream the record says so.
  const moving = await app({ ai: false, policy });
  await moving.change(90);
  assert.deepEqual(plain(await moving.press('lc:live-start', policy)), { ok: true });
  await moving.change(90);
  await until('the first look', () => moving.looks().length === 1);
  assert.equal(moving.lines().find((l) => l['kind'] === 'first_picture')!['stream_new_frame'], true);

  // The looks have no request left (all are kept for the user): the first picture is kept and named in the record,
  // and not sent: a gap.
  const none = await app({ ai: false, policy: { ...policy, max_submissions: 1 } });
  await none.change(90);
  assert.deepEqual(plain(await none.press('lc:live-start', { ...policy, max_submissions: 1 })), { ok: true });
  await still(none);
  await settle();
  assert.deepEqual([none.looks().length, none.lines().map((l) => [l['kind'], l['frame_seq'] ?? null, l['reason'] ?? null])], [0, [['started', null, null], ['first_picture', 1, null], ['gap', 1, 'budget']]]);

  // A first picture that cannot be kept (a write that fails) is said as the look that was not made, and not offered
  // again and again: the next look is the next step of the display.
  const full = await app({ ai: false, policy });
  const offers = counted(full);
  await full.change(90);
  assert.deepEqual(plain(await full.press('lc:live-start', policy)), { ok: true });
  full.h.failWrites.only = `${path.sep}frames${path.sep}`;
  await full.change(91); // (less than a step of the display: not kept by the capture; a picture of its own for the look)
  for (let i = 0; i < 4; i += 1) await still(full);
  assert.deepEqual([offers.n, full.looks().length, frames(full).length], [1, 0, 1]);
  assert.match(full.live().missed ?? '', /^its first picture could not be kept on this device \(it could not be written to this device \(.*EIO.*\)\), and only a kept picture is given to ChatGPT by itself$/);
  full.h.failWrites.only = null;
  await full.change(200);
  await until('the next step is looked at', () => full.looks().length === 1);

  // A first picture that cannot be made (the encoder fails) is tried at three samples, then given up, and that is
  // said in the toolbar; nothing is tried without end.
  const broken = await app({ ai: false, policy });
  const tried = counted(broken);
  await broken.change(90);
  assert.deepEqual(plain(await broken.press('lc:live-start', policy)), { ok: true });
  broken.page.scene.encodingFails = true;
  await still(broken);
  await still(broken);
  assert.doesNotMatch(broken.page.hint() ?? '', /Its first picture/);
  await still(broken);
  assert.match(broken.page.hint() ?? '', /it has not looked yet\. Its first picture of this display could not be made \(the encoder failed \(injected\)\): it looks when the display changes\./);
  broken.page.scene.encodingFails = false;
  for (let i = 0; i < 3; i += 1) await still(broken);
  assert.deepEqual([tried.n, broken.looks().length], [0, 0], 'given up: nothing is offered for this session any more');
  await broken.change(200);
  await until('the next step is looked at', () => broken.looks().length === 1);
  broken.c().see('Seen.');
  await until('looked', () => broken.live().seen !== null);
  assert.doesNotMatch(broken.page.hint() ?? '', /Its first picture/);
});

test('[synthetic connector] distinct AI sessions with the same wall-clock Start each get their own first look on an unchanged screen', async () => {
  const policy: Policy = { ...POLICY, min_observation_interval_ms: 500 };
  const fixed = Date.now();
  const evaluate = vm.runInContext;
  let creating!: ReturnType<typeof app>;
  // Only this main-process VM has a fixed clock. Harness creation is synchronous; restore the evaluator before
  // awaiting anything, so the host clock and the overlay's fresh picture timestamps are untouched.
  try {
    vm.runInContext = (source, context, options) => evaluate(`Date.now = () => ${fixed};\n${source}`, context, options);
    creating = app({ policy });
  } finally {
    vm.runInContext = evaluate;
  }
  const w = await creating;
  await w.change(90);
  await until('the first session\'s look', () => w.looks().length === 1);
  const first = w.looks()[0]!;
  const since = w.live().since;
  w.c().see('Synthetic notes.');
  await until('the first session looked', () => w.live().seen?.frame_seq === 1);
  const grabs = w.page.scene.grabs;
  w.press('lc:live-stop');
  assert.deepEqual(plain(await w.press('lc:live-start', policy)), { ok: true });
  assert.equal(w.live().since, since, 'a wall-clock timestamp may repeat; it is not the AI session\'s identity');
  const starts = w.c().calls.filter((c) => c.method === 'companion/start');
  assert.notEqual(starts[0]!.params['session_id'], starts[1]!.params['session_id']);
  await w.page.review.sameFrameLate(0);
  await w.page.review.pending();
  await settle();
  assert.equal(w.page.scene.grabs, grabs + 1, 'read the source again for the new session; a cached bitmap from the old session is not its first picture');
  assert.equal(w.looks().length, 2, 'the new session gets its own first picture even when its Start time repeats');
  const second = w.looks()[1]!;
  assert.deepEqual([second.session_id, second.context.frame_seq, w.live().frames, w.page.review.retention().retained], [starts[1]!.params['session_id'], 1, 1, 1]);
  assert.notEqual(second.session_id, first.session_id);
  assert.ok(Date.parse(second.context.frame_captured_at!) >= fixed);
  await w.page.review.sameFrameLate(0);
  await w.page.review.pending();
  await settle();
  assert.equal(w.page.scene.grabs, grabs + 1, 'later still samples reuse the picture already taken for this session');
  assert.equal(w.looks().length, 2, 'offered once for each distinct session');
});

test('[synthetic connector] a material frame encoded across an AI restart remains retained without becoming the new session\'s first look', async () => {
  const policy: Policy = { ...POLICY, min_observation_interval_ms: 500 };
  const fixed = Date.now();
  const evaluate = vm.runInContext;
  let creating!: ReturnType<typeof app>;
  try {
    vm.runInContext = (source, context, options) => evaluate(`Date.now = () => ${fixed};\n${source}`, context, options);
    creating = app({ policy });
  } finally {
    vm.runInContext = evaluate;
  }
  const w = await creating;
  const since = w.live().since;
  const oldSession = w.c().calls.find((c) => c.method === 'companion/start')!.params['session_id'];
  let release!: () => void;
  w.page.encoding.gate = new Promise<void>((r) => (release = r));
  const changing = w.change(90);
  try {
    await until('the frame is sampled while its encoding waits', () => w.page.review.samples().length === 1);
    assert.deepEqual([w.page.scene.grabs, w.looks().length, w.page.review.retention().retained], [1, 0, 0]);
    w.press('lc:live-stop');
    assert.deepEqual(plain(await w.press('lc:live-start', policy)), { ok: true });
    assert.equal(w.live().since, since, 'the old acquisition cannot be recognized by time alone when the Start clock repeats');
  } finally {
    w.page.encoding.gate = null;
    release();
    await changing;
    await w.page.review.retention().queue;
    await settle();
  }
  const starts = w.c().calls.filter((c) => c.method === 'companion/start');
  const newSession = starts[1]!.params['session_id'];
  assert.notEqual(newSession, oldSession);
  assert.deepEqual([w.page.review.retention().retained, w.looks().length, w.live().frames], [1, 0, 0], 'keep the capture\'s original frame, but an old encoding grants no authority to observe in the new AI session');
  const captures = path.join(w.h.userData, 'captures');
  const folder = path.join(captures, fs.readdirSync(captures)[0]!);
  const retained = fs.readFileSync(path.join(folder, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { kind: string; raw?: { file: string; sha256: string } }).find((l) => l.kind === 'retained')!;
  assert.ok(fs.existsSync(path.join(folder, retained.raw!.file)), 'the original named by the capture manifest remains on disk');
  await w.page.review.sameFrameLate(0);
  await w.page.review.pending();
  await settle();
  assert.deepEqual([w.page.scene.grabs, w.looks().length, w.live().frames, w.page.review.retention().retained], [2, 1, 1, 1], 'the current session takes its own first picture without writing the same material step twice');
  assert.deepEqual([w.looks()[0]!.session_id, w.looks()[0]!.image.sha256], [newSession, retained.raw!.sha256]);
});
