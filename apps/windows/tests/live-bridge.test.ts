// The app against the RELEASED live bridge: the real main.ts, overlay.ts and Subscription on one side of real pipes,
// and on the other the Backend's own run_stream / LiveSubscriptionBridge with Learning's own preparation and binding
// (tests/live-bridge-child.py), with a stand-in for the provider client only. This is the released scheduler, session
// bounds, frame checks and binding answering the lines this app really writes; it is not the real connector child
// (no FIFO launcher, no Codex app server), not an account and not a model.
// SYNTHETIC: every "response" is text this test wrote; the display is a fake; no Codex, no ChatGPT, no sign-in, no
// network. Runs only with LC_BACKEND_ROOT (a Backend checkout that has the live bridge) and LC_PYTHON set.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { harness, plain, quitLinks, running, settle as started, type FakeWindow } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { connectorConfig, removeConfigs } from './subscription-fakes.ts';
import type { Policy } from '../src/shared/live.ts';

const BACKEND = process.env['LC_BACKEND_ROOT'];
const PYTHON = process.env['LC_PYTHON'];
const available = Boolean(BACKEND && PYTHON && fs.existsSync(path.join(BACKEND, 'services', 'worker', 'connectors', 'chatgpt_live.py')));
const controls: string[] = [];
after(quitLinks);
after(removeConfigs);
after(() => controls.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const settle = (): Promise<void> => new Promise((done) => setImmediate(done));
type Live = { state: string; used?: number; paused?: string | null; ended?: string | null; seen?: { frame_seq: number } | null; frames?: number; out?: number; max_submissions?: number };
type Event = { event: string; request_id: string; outcome?: string; confirmed?: boolean; image_sha256?: string };

/** The app with the released bridge as its connector (a real child over real pipes), checked, and a capture started with the AI. */
async function app(policy: Policy) {
  const control = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-live-bridge-'));
  controls.push(control);
  const errors = fs.openSync(path.join(control, 'stderr.txt'), 'a');
  // In place of the WSL launch: the fixture, with the same pipes (its error output goes to a file, never read by the app).
  const launch = (() => spawn(PYTHON!, ['-B', path.join(import.meta.dirname, 'live-bridge-child.py'), BACKEND!, control], { stdio: ['pipe', 'pipe', errors], env: { PATH: process.env['PATH'] ?? '', PYTHONDONTWRITEBYTECODE: '1' } })) as unknown as typeof spawn;
  const h = harness({ env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig() }, subscription: { spawn: launch, request_ms: 8000, ask_ms: 20_000, end_ms: 9000 } });
  await started();
  const window = h.control() as unknown as FakeWindow;
  const press = (channel: string, ...args: unknown[]): unknown => h.handlers[channel]!({ sender: window.webContents }, ...args);
  const live = (): Live => (plain(press('lc:session-state')) as { live?: Live }).live ?? { state: 'no capture' };
  press('lc:sub-check');
  await until('signed in, as the released bridge reads the account', () => (plain(press('lc:sub-state')) as { state?: string }).state === 'signed_in', 15_000);
  const s = await running(h, { policy });
  await until('the AI is on', () => live().state === 'on', 15_000);
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  page.scene.exactPng = true;
  const provider = (): Event[] => (fs.existsSync(path.join(control, 'provider.jsonl')) ? fs.readFileSync(path.join(control, 'provider.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Event) : []);
  const submitted = (): string[] => provider().filter((e) => e.event === 'submitted').map((e) => e.request_id);
  /** The provider completes that request with `text`. */
  const answer = (request: string, text: string): void => fs.writeFileSync(path.join(control, `answer-${request}`), text);
  const fail = (request: string, code: string): void => fs.writeFileSync(path.join(control, `fail-${request}`), code);
  const change = async (shade: number): Promise<void> => {
    page.scene.shade = shade;
    await page.review.sample();
    await page.review.pending();
    await settle();
  };
  const folder = (): string => path.join(h.userData, 'captures', fs.readdirSync(path.join(h.userData, 'captures'))[0]!);
  const lines = (): Array<Record<string, unknown>> => fs.readFileSync(path.join(folder(), 'live.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
  const record = (): { selection_id: string; requests: Array<{ request_id: string; trigger: string; frame: { frame_seq: number; focus: string }; outcome: { status: string; code?: string } | null; shown: boolean; submission?: string }> } => {
    const dir = path.join(folder(), 'asks');
    return JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().at(-1)!), 'utf8'));
  };
  const select = async (x = 190, width = 210): Promise<void> => {
    page.press('ASK');
    page.pointer('pointerdown', 2, x, 95);
    for (const [px, py] of [[x + width, 95], [x + width, 125], [x, 125]] as const) page.pointer('pointermove', 2, px, py);
    page.pointer('pointerup', 2, x + 2, 97);
    await until('the card, and its own request', () => page.review.card()?.text.includes(`Region ${x - 8},87 `) === true && /^Asked at/.test(page.ask().status ?? ''), 10_000);
  };
  const followUp = async (words: string): Promise<void> => {
    page.question(words);
    page.click('askSubmit');
    await until('acknowledged', () => /^Asked at/.test(page.ask().status ?? '') || /^Not sent/.test(page.ask().status ?? ''), 10_000);
  };
  return { h, page, press, live, control, provider, submitted, answer, fail, change, lines, record, select, followUp, stderr: () => fs.readFileSync(path.join(control, 'stderr.txt'), 'utf8') };
}

test('[released bridge, synthetic provider] a whole session as the app really writes it is taken by the released bridge: Start, looks one at a time, a circle\'s hint, a follow-up on the same frame and on a later one, each bound by Learning and read back as bound here', { skip: !available }, async () => {
  const w = await app({ max_submissions: 12, max_session_ms: 600_000, min_observation_interval_ms: 500 });
  // A look: the released Learning preparation decodes the whole picture; the released binding's result is read as bound here.
  await w.change(90);
  await until('the look reaches the provider', () => w.submitted().length === 1, 10_000);
  const look1 = w.submitted()[0]!;
  assert.match(look1, /^live-[0-9a-f]{16}\.look\.1$/);
  w.answer(look1, 'A page about slopes is open.');
  await until('seen', () => w.live().seen?.frame_seq === 1, 10_000);
  assert.deepEqual([w.live().used, w.live().out, w.page.review.card()], [1, 0, null], 'an observation is never a card');
  // A circle: its own request, answered; shown on its card.
  await w.select();
  await until('the circle\'s request reaches the provider', () => w.submitted().length === 2, 10_000);
  const circle = w.record().requests[0]!;
  assert.equal(w.submitted()[1], circle.request_id);
  w.answer(circle.request_id, 'Look at the sign of the slope.');
  await until('shown', () => w.page.ask().answer === 'Look at the sign of the slope.', 10_000);
  // A follow-up on the same unchanged frame: the released bridge takes the same frame again (its own identity check), with the focus kept.
  await w.followUp('Why does the sign matter?');
  await until('the follow-up reaches the provider', () => w.submitted().length === 3, 10_000);
  const same = w.record().requests[1]!;
  assert.deepEqual([same.frame.frame_seq, same.frame.focus], [circle.frame.frame_seq, 'on_this_frame']);
  w.answer(same.request_id, 'It says whether the line rises.');
  await until('shown', () => w.page.ask().answer === 'It says whether the line rises.', 10_000);
  // The screen changes: a second look (after the least time between two), then a follow-up on a LATER frame, with
  // the circle only named. The released contract validates the reference entry this app wrote.
  await w.change(170);
  w.h.fire(500);
  await until('the second look reaches the provider', () => w.submitted().length === 4, 10_000);
  w.answer(w.submitted()[3]!, 'The page was scrolled to the next problem.');
  await until('seen again', () => (w.live().seen?.frame_seq ?? 0) > circle.frame.frame_seq, 10_000);
  await w.followUp('And this one?');
  await until('the later follow-up reaches the provider', () => w.submitted().length === 5, 10_000);
  const later = w.record().requests[2]!;
  assert.deepEqual([later.frame.frame_seq > circle.frame.frame_seq, later.frame.focus], [true, 'on_an_earlier_frame']);
  w.answer(later.request_id, 'This one asks for the intercept.');
  await until('shown', () => w.page.ask().answer === 'This one asks for the intercept.', 10_000);
  assert.deepEqual(w.record().requests.map((r) => [r.trigger, r.outcome?.status, r.shown, r.submission]), [['focus', 'answered', true, 'submitted'], ['text_followup', 'answered', true, 'submitted'], ['text_followup', 'answered', true, 'submitted']]);
  // Every request was completed by the bridge (none refused as stale, malformed or busy), and the app's count is the bridge's.
  assert.deepEqual(w.provider().filter((e) => e.event === 'finished').map((e) => e.outcome), ['completed', 'completed', 'completed', 'completed', 'completed']);
  assert.deepEqual([w.live().state, w.live().used, w.live().out], ['on', 5, 0]);
  assert.equal(w.stderr(), '');
  // Stop: the bridge is told, and the app's connector ends by the end of its input.
  w.h.end('stopped by the test');
  await until('ended', () => w.h.current() === null, 10_000);
  assert.deepEqual(w.lines().filter((l) => ['started', 'ended', 'not_looked', 'gap'].includes(String(l['kind']))).map((l) => l['kind']), ['started', 'ended']);
});

test('[released bridge, synthetic provider] the bridge\'s own scheduling and the app\'s agree: a circle while a look is out, the reserve for the user\'s requests, a confirmed interruption, and an interruption that is not confirmed', { skip: !available }, async () => {
  // A circle while a look is out: the released bridge interrupts the look for the user's request (confirmed), and
  // answers the circle; the look's frame is a gap in what the AI saw; the session goes on.
  let w = await app({ max_submissions: 5, max_session_ms: 600_000, min_observation_interval_ms: 500 });
  await w.change(90);
  await until('the look reaches the provider', () => w.submitted().length === 1, 10_000);
  await w.select();
  await until('the look was interrupted for the circle, and the circle reaches the provider', () => w.submitted().length === 2 && w.provider().some((e) => e.event === 'interrupted' && e.confirmed === true), 10_000);
  const circle = w.record().requests[0]!;
  w.answer(circle.request_id, 'A hint.');
  await until('shown', () => w.page.ask().answer === 'A hint.', 10_000);
  await until('the look settled', () => w.live().out === 0, 10_000);
  assert.deepEqual([w.live().state, w.live().used, w.lines().filter((l) => l['kind'] === 'not_looked').map((l) => [l['code'], l['submission']]), w.lines().filter((l) => l['kind'] === 'gap').map((l) => [l['frame_seq'], l['reason']])], ['on', 2, [['stale_context', 'submitted']], [[1, 'backpressure']]]);
  // The reserve: of five requests the last one is the user's. Two more looks use the third and fourth; the next
  // frame is not sent by the app, and the bridge is never asked for it.
  for (const shade of [150, 210]) {
    await w.change(shade);
    w.h.fire(500);
    const n = w.submitted().length;
    await until('a look reaches the provider', () => w.submitted().length === n + 1, 10_000);
    w.answer(w.submitted().at(-1)!, `Noted at ${shade}.`);
    await until('seen', () => w.live().out === 0 && w.live().used === n + 1, 10_000);
  }
  assert.deepEqual([w.live().used, w.live().paused], [4, null]);
  await w.change(40);
  w.h.fire(500);
  await settle();
  assert.deepEqual([w.submitted().length, w.live().paused, w.live().state], [4, 'the requests left in this session are kept for your own focus and follow-ups', 'on']);
  // The user's own request still goes, and is the session's last.
  await w.followUp('And now?');
  await until('the follow-up reaches the provider', () => w.submitted().length === 5, 10_000);
  w.answer(w.submitted().at(-1)!, 'The last one.');
  await until('shown', () => w.page.ask().answer === 'The last one.', 10_000);
  assert.deepEqual([w.live().state, w.live().used], ['used_up', 5]);
  assert.equal(w.stderr(), '');

  // The user cancels a circle's request; the provider confirms the interruption: said as cancelled, the session goes on.
  w = await app({ max_submissions: 12, max_session_ms: 600_000, min_observation_interval_ms: 500 });
  await w.select();
  await until('the circle reaches the provider', () => w.submitted().length === 1, 10_000);
  w.page.click('askCancel');
  await until('said as cancelled', () => w.page.ask().status === 'Cancelled: no answer is shown.', 10_000);
  assert.deepEqual([w.live().state, w.live().used, w.provider().filter((e) => e.event === 'interrupted').map((e) => e.confirmed)], ['on', 1, [true]]);
  // The provider does NOT confirm the next interruption: the bridge stops its session, and so does the app, at once.
  fs.writeFileSync(path.join(w.control, 'unconfirmed'), '');
  await w.select(600, 120);
  await until('the circle reaches the provider', () => w.submitted().length === 2, 10_000);
  w.page.click('askCancel');
  await until('the session is over', () => w.live().state === 'ended' && w.live().out === 0, 15_000);
  assert.match(w.live().ended ?? '', /interrupt|not confirmed/);
  assert.match(w.page.ask().status ?? '', /^Cancelled: no answer is shown\. Whether ChatGPT stopped working on it is not confirmed/);
  // Nothing is sent after that; the bridge would refuse it, and the app does not ask.
  await w.change(90);
  w.h.fire(500);
  await settle();
  assert.equal(w.submitted().length, 2);
  // The provider refuses a look for the account's allowance: the bridge's code is said in this app's fixed words, and the session ends.
  w = await app({ max_submissions: 12, max_session_ms: 600_000, min_observation_interval_ms: 500 });
  await w.change(90);
  await until('the look reaches the provider', () => w.submitted().length === 1, 10_000);
  w.fail(w.submitted()[0]!, 'quota_exhausted');
  await until('ended', () => w.live().state === 'ended', 10_000);
  assert.deepEqual([w.live().ended, w.live().used], ['ChatGPT says the account\'s allowance is used up; nothing more is sent by itself', 1]);
});
