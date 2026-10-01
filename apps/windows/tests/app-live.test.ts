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
type Live = { state: string; reason?: string | null; model?: string; max_submissions?: number; used?: number; reserve?: number; paused?: string | null; missed?: string | null; ended?: string | null; seen?: { at: string; frame_seq: number } | null; frames?: number; out?: number; unwritten?: number };

/**
 * The app with the subscription configured; by default checked (signed in) and the capture started with the AI's
 * session within `policy`. `ai: false`: the capture alone. `check: false`: not checked before Start.
 */
async function app(o: { policy?: Policy; ai?: boolean; check?: boolean; configure?: (c: FakeConnector) => void } = {}) {
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
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
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
  w.press('lc:live-stop');
  await until('ended', () => w.live().state === 'ended' && w.live().out === 0);
  assert.deepEqual([w.live().ended, w.c().count('companion/stop'), w.h.current() !== null, w.live().seen], ['stopped by you', 1, true, null]);
  assert.deepEqual(w.lines().map((l) => l['kind']), ['started', 'look', 'ended', 'gap', 'not_looked']);
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
  assert.deepEqual(w.lines().map((l) => [l['kind'], l['reason'] ?? null]), [['started', null], ['ended', 'the capture was stopped']]);
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
