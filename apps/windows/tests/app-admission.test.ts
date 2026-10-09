// A test's source check through the app: the real main.ts and overlay.ts under the unit-test fakes, with
// LC_SOURCE_ADMISSION configured. The capture is armed, each frame is taken from the stream, and each request is sent
// to ChatGPT only after a fresh decision of the test's checker; a frame is used only if its own taking was admitted;
// anything but "allow" ends the whole capture; a Stop during any wait takes, keeps and sends nothing.
// SYNTHETIC: the checker (tests/admission-fakes.ts) and the connector (tests/subscription-fakes.ts) are stand-ins, the
// display is a fake and every "response" is text this test wrote. No Windows, no native check, no capture of a real
// screen, no Codex, no ChatGPT and no network are involved.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { harness, plain, quitLinks, running, settle as started, type FakeWindow } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { png as pngOf } from './png.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { connectorConfig, fakeConnectors, removeConfigs, type FakeConnector } from './subscription-fakes.ts';
import { admissionConfig, echo, fakeCheckers, type FakeChecker, type Request } from './admission-fakes.ts';
import type { Policy, Turn } from '../src/shared/live.ts';

after(quitLinks);
after(removeConfigs);
const POLICY: Policy = { max_submissions: 60, max_session_ms: 1_800_000, min_observation_interval_ms: 500 };
const settle = (): Promise<void> => new Promise((done) => setImmediate(done));
const sha = (b: Uint8Array | Buffer): string => crypto.createHash('sha256').update(b).digest('hex');
type Live = { state: string; since?: string; ended?: string | null; frames?: number; out?: number; seen?: { frame_seq: number } | null };
type SourceAdmission = { capture_id: string; overlay: { pid: number; hwnd: string } | null; active: boolean };

/**
 * The app with the subscription checked and a test's source check configured; the capture started with the AI's
 * session (unless `ai: false`) and its overlay page, not armed yet (`arm()`).
 */
async function app(o: { configure?: (c: FakeChecker) => void; config?: Record<string, unknown>; ai?: boolean; env?: Record<string, string> } = {}) {
  const fakes = fakeConnectors();
  const checkers = fakeCheckers(o.configure);
  const env = o.env ?? { LC_SUBSCRIPTION_CONNECTOR: connectorConfig(), LC_SOURCE_ADMISSION: admissionConfig(o.config) };
  const h = harness({ env, subscription: { spawn: fakes.spawn, request_ms: 500, ask_ms: 20_000, end_ms: 500 }, admission: { spawn: checkers.spawn, endMs: 50 } });
  await started();
  const control = h.control() as unknown as FakeWindow;
  const press = (channel: string, ...args: unknown[]): unknown => h.handlers[channel]!({ sender: control.webContents }, ...args);
  const state = (): { running: boolean; ending?: boolean; ended?: string | null; live?: Live; source_admission?: SourceAdmission } => plain(press('lc:session-state')) as never;
  const live = (): Live => state().live ?? { state: 'no capture' };
  press('lc:sub-check');
  await until('signed in', () => (plain(press('lc:sub-state')) as { state?: string }).state === 'signed_in', 3000);
  const s = await running(h, o.ai === false ? null : { policy: POLICY });
  if (o.ai !== false) await until('the AI is on', () => live().state === 'on', 3000);
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 }, { admission: env['LC_SOURCE_ADMISSION'] !== undefined });
  page.scene.exactPng = true;
  const folder = (): string => path.join(h.userData, 'captures', fs.readdirSync(path.join(h.userData, 'captures'))[0]!);
  const jsonl = (name: string): Array<Record<string, unknown>> => {
    const f = path.join(folder(), name);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : [];
  };
  /** What main recorded of the check: one line per decision (and violation, and the checker's end). */
  const record = (): Array<Record<string, unknown>> => jsonl('admission.jsonl');
  const frames = (): string[] => (fs.existsSync(path.join(folder(), 'frames')) ? fs.readdirSync(path.join(folder(), 'frames')).sort() : []);
  const c = (): FakeChecker => checkers.last();
  const connector = (): FakeConnector => fakes.last();
  const looks = (): Turn[] => connector().looks().map((l) => l.params as unknown as Turn);
  const asks = (): Turn[] => connector().asks().map((l) => l.params as unknown as Turn);
  /** A sample in which the display shows `shade` and the stream presents a new frame. */
  const change = async (shade: number): Promise<void> => {
    page.scene.shade = shade;
    await page.review.sample();
    await page.review.pending();
    await settle();
  };
  /** A sample with no new frame of the stream (the screen is still). */
  const still = async (): Promise<void> => {
    await page.review.sameFrameLate(0);
    await page.review.pending();
    await settle();
  };
  /** A circle in ASK; with the AI on, its own request is waited for. */
  const select = async (x = 190, width = 210): Promise<void> => {
    const before = connector().asks().length;
    page.press('ASK');
    page.pointer('pointerdown', 2, x, 95);
    for (const [px, py] of [[x + width, 95], [x + width, 125], [x, 125]] as const) page.pointer('pointermove', 2, px, py);
    page.pointer('pointerup', 2, x + 2, 97);
    await until('the card', () => page.review.card()?.text.includes(`Region ${x - 8},87 `) === true && page.ask().form);
    if (live().state === 'on') await until('the circle\'s own request', () => connector().asks().length === before + 1, 3000);
  };
  const ended = (): Promise<void> => until('the capture ended', () => h.current() === null, 5000);
  return { h, s, fakes, checkers, c, connector, page, control, press, state, live, folder, record, frames, looks, asks, change, still, select, ended, jsonl };
}
const decisions = (w: Awaited<ReturnType<typeof app>>): Array<[unknown, unknown, unknown]> => w.record().filter((l) => l['kind'] === 'decision').map((l) => [l['phase'], l['frame_seq'], l['allowed']]);

test('[synthetic checker] unconfigured, the product as it is: nothing is asked, nothing waits, no checker is run and nothing is recorded; only the overlay may ask, and only with a check configured', async () => {
  const fakes = fakeConnectors();
  const checkers = fakeCheckers();
  const h = harness({ env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig() }, subscription: { spawn: fakes.spawn, request_ms: 500, ask_ms: 20_000, end_ms: 500 }, admission: { spawn: checkers.spawn } });
  await started();
  const s = await running(h);
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  page.scene.shade = 90;
  await page.review.sample();
  await page.review.pending();
  await until('kept', () => page.review.retention().retained >= 1);
  assert.deepEqual([page.admits, checkers.made.length, plain(await h.handlers['lc:arm-capture']!({ sender: s.overlay.webContents }))], [[], 0, true], 'armed at once');
  const dir = path.join(h.userData, 'captures', fs.readdirSync(path.join(h.userData, 'captures'))[0]!);
  assert.equal(fs.existsSync(path.join(dir, 'admission.jsonl')), false);
  // Nothing to admit, from anyone.
  assert.deepEqual(plain(await h.handlers['lc:admit-frame']!({ sender: s.overlay.webContents }, 'pre', 9, null)), { ok: false });
  const control = h.control() as unknown as FakeWindow;
  assert.deepEqual(plain(await h.handlers['lc:admit-frame']!({ sender: control.webContents }, 'pre', 9, null)), { ok: false });
  assert.notEqual(h.current(), null, 'nothing of it ends a capture');

  // Configured, from the control window: refused, and not a violation.
  const w = await app();
  assert.equal(await w.page.arm(), true);
  assert.deepEqual(plain(await w.h.handlers['lc:admit-frame']!({ sender: w.control.webContents }, 'pre', 1, null)), { ok: false });
  assert.deepEqual([w.c().of('pre_acquire').length, w.h.current() !== null], [0, true]);
});

test('[synthetic checker] configured but not usable: every Start is refused with why, and nothing is captured; a checker that cannot be started, or is not ready, refuses the arming and ends the capture', async () => {
  for (const [config, why] of [[{ decision_ms: 50 }, 'the source check configured for this test is not valid, so nothing is captured'], [{ checker: { command: 'powershell.exe', args: [] } }, 'the source check configured for this test is not valid, so nothing is captured']] as const) {
    const checkers = fakeCheckers();
    const h = harness({ env: { LC_SOURCE_ADMISSION: admissionConfig(config) }, admission: { spawn: checkers.spawn } });
    await started();
    assert.deepEqual(plain(await h.start('screen:1:0')), { ok: false, reason: why });
    assert.deepEqual([h.current(), checkers.made.length, h.liveOverlays().length], [null, 0, 0]);
  }
  const unreadable = harness({ env: { LC_SOURCE_ADMISSION: path.join(path.dirname(admissionConfig()), 'missing.json') } });
  await started();
  assert.deepEqual(plain(await unreadable.start('screen:1:0')), { ok: false, reason: 'the source check configured for this test could not be read, so nothing is captured' });

  // Not ready in time: not armed; the whole capture ends, with why; the AI session with it.
  const slow = await app({ config: { ready_ms: 1000 }, configure: (x) => void (x.autoReady = false) });
  assert.equal(await slow.page.arm(), false);
  await slow.ended();
  assert.equal(slow.state().ended, 'the test\'s source check ended the capture: the source check was not ready within 1000 ms');
  assert.equal(slow.connector().count('companion/turn'), 0);
  // Its arming refused: the same; no frame is ever asked about.
  const no = await app({ configure: (x) => void (x.mode = 'deny') });
  assert.equal(await no.page.arm(), false);
  await no.ended();
  assert.deepEqual([no.c().requests.map((r) => r.phase), no.state().ended], [['arm'], 'the test\'s source check ended the capture: the source check refused arming the capture']);
  await until('its end recorded', () => no.record().some((l) => l['kind'] === 'checker_end'));
  assert.deepEqual(no.record().map((l) => [l['kind'], l['phase'] ?? null, l['allowed'] ?? null]), [['decision', 'arm', false], ['violation', null, null], ['checker_end', null, null]]);
});

test('[synthetic checker] armed before the stream; each frame is taken only between two admissions bound to its own sample, then kept and looked at; a request is sent only after a fresh admission naming that frame (by its own number, not the AI session\'s) and the exact picture sent', async () => {
  const w = await app();
  assert.equal(await w.page.arm(), true);
  const arm = w.c().requests[0]!;
  assert.deepEqual([arm.phase, arm.display, arm.sample_seq, arm.frame_seq, arm.raw_sha256, arm.raw_size, arm.request_id, arm.image_sha256], ['arm', { id: '1', bounds: { x: 0, y: 0, width: 1280, height: 800 }, scale_factor: 1 }, null, null, null, null, null, null]);
  assert.equal(arm.capture_id, path.basename(w.folder()));
  // A frame: taken between its two admissions, kept, then looked at after a third.
  const grabs = w.page.scene.grabs;
  await w.change(90);
  await until('the first look', () => w.looks().length === 1);
  const [pre, post, send] = [w.c().of('pre_acquire')[0]!, w.c().of('post_acquire')[0]!, w.c().of('send')[0]!];
  assert.deepEqual([pre.sample_seq, pre.frame_seq, pre.raw_sha256, pre.raw_size], [1, null, null, null], 'before the taking: its sample only');
  assert.deepEqual([post.sample_seq, post.frame_seq, post.raw_size, w.page.scene.grabs - grabs], [1, 1, { width: 1280, height: 800 }, 1]);
  assert.match(post.raw_sha256 as string, /^[0-9a-f]{64}$/);
  const look = w.looks()[0]!;
  assert.deepEqual([send.sample_seq, send.frame_seq, send.raw_sha256, send.raw_size, send.request_id, send.image_sha256], [1, 1, post.raw_sha256, { width: 1280, height: 800 }, look.request_id, look.image.sha256]);
  assert.equal(look.image.sha256, sha(Buffer.from(look.image.png_base64, 'base64')), 'the exact PNG sent');
  // The retained frame is that admitted frame.
  const retained = w.jsonl('manifest.jsonl').filter((l) => l['kind'] === 'retained');
  assert.deepEqual([retained.length, retained[0]!['frame_seq'], (retained[0]!['raw'] as { pixels_sha256: string }).pixels_sha256], [1, 1, post.raw_sha256]);
  w.connector().see('A page.');
  await until('seen', () => w.live().seen?.frame_seq === 1);
  // No new frame of the stream: nothing is taken, so nothing is admitted; the same pixels in a new frame are taken
  // (and admitted) but not kept; a change is.
  const before = w.c().requests.length;
  await w.still();
  assert.equal(w.c().requests.length, before, 'a frame that is reused is not taken again');
  await w.change(90);
  await w.change(140);
  const posts = w.c().of('post_acquire').map((r) => r.frame_seq);
  assert.deepEqual(posts, [1, 3, 4], 'the overlay\'s own numbers of the frames it took (sample 2 took none)');
  w.h.fire(500); // the least time between two looks
  await until('the second look', () => w.looks().length === 2);
  const second = w.c().of('send')[1]!;
  assert.deepEqual([second.frame_seq, second.sample_seq, w.looks()[1]!.context.frame_seq], [4, 4, 2], 'frame 4 of the capture is the AI session\'s frame 2: the check is told the capture\'s, never the session\'s');
  const sentLine = w.record().filter((l) => l['phase'] === 'send')[1]!;
  assert.deepEqual([sentLine['frame_seq'], sentLine['ai_frame_seq'], sentLine['request_id'], sentLine['live_session_id'], sentLine['allowed']], [4, 2, w.looks()[1]!.request_id, w.looks()[1]!.session_id, true], 'main records both, to relate them');
  assert.deepEqual(w.record().filter((l) => l['kind'] === 'decision').map((l) => l['phase']), ['arm', 'pre_acquire', 'post_acquire', 'send', 'pre_acquire', 'post_acquire', 'pre_acquire', 'post_acquire', 'send']);
  assert.equal(w.c().requests.every((r, i) => r.seq === i + 1), true);
});

test('[synthetic checker] a refused admission before the taking: no frame is taken; after it: the frame is closed unused (not shown, kept, looked at or sent); either ends the whole capture and its AI session, with why', async () => {
  const pre = await app({ configure: (x) => x.holdPhases.add('pre_acquire') });
  assert.equal(await pre.page.arm(), true);
  const grabs = pre.page.scene.grabs;
  pre.page.scene.shade = 90;
  const sampling = pre.page.review.sample();
  await until('asked', () => pre.c().of('pre_acquire').length === 1);
  pre.c().reply(pre.c().waiting(), { verdict: 'deny', reason: 'the owned window is not in front' });
  await sampling;
  await pre.ended();
  assert.deepEqual([pre.page.scene.grabs - grabs, pre.c().of('post_acquire').length, pre.frames(), pre.looks().length], [0, 0, [], 0]);
  assert.equal(pre.state().ended, 'the test\'s source check ended the capture: the source check refused taking a frame (the owned window is not in front)');
  assert.equal(pre.jsonl('live.jsonl').find((l) => l['kind'] === 'ended')!['reason'], 'the capture was stopped', 'not merely the AI: the whole capture');

  const post = await app({ configure: (x) => x.holdPhases.add('post_acquire') });
  assert.equal(await post.page.arm(), true);
  post.page.scene.shade = 90;
  const taking = post.page.review.sample();
  await until('asked after the taking', () => post.c().of('post_acquire').length === 1);
  post.c().reply(post.c().waiting(), { verdict: 'deny', reason: null });
  await taking;
  await post.page.review.pending();
  await post.ended();
  assert.deepEqual([post.page.review.retention().retained, post.frames(), post.looks().length, post.c().of('send').length, post.page.review.card()], [0, [], 0, 0, null]);
  assert.equal(post.state().ended, 'the test\'s source check ended the capture: the source check refused the frame taken');
  assert.deepEqual(decisions(post), [['arm', null, true], ['pre_acquire', null, true], ['post_acquire', 1, false]]);
});

test('[synthetic checker] an answer that is not the waiting request\'s, none in time, or a frame presented without its own ticket: rejected, and the capture ends; nothing of that frame is kept or sent', async () => {
  // Another frame's answer to the frame just taken.
  const other = await app({ configure: (x) => x.holdPhases.add('post_acquire') });
  assert.equal(await other.page.arm(), true);
  other.page.scene.shade = 90;
  const taking = other.page.review.sample();
  await until('asked', () => other.c().of('post_acquire').length === 1);
  other.c().reply(other.c().waiting(), { frame_seq: 99 });
  await taking;
  await other.ended();
  assert.match(other.state().ended ?? '', /answer is not to the request that is waiting \(frame_seq\)/);
  assert.deepEqual([other.frames(), other.looks().length], [[], 0]);
  // No answer in time: rejected; its late answer is not new authority.
  const late = await app({ config: { decision_ms: 100 }, configure: (x) => x.holdPhases.add('pre_acquire') });
  assert.equal(await late.page.arm(), true);
  const grabs = late.page.scene.grabs;
  const sampling = late.page.review.sample();
  await until('asked', () => late.c().of('pre_acquire').length === 1);
  const waiting = late.c().waiting();
  await sampling;
  await late.ended();
  late.c().reply(waiting);
  await settle();
  assert.equal(late.state().ended, 'the test\'s source check ended the capture: the source check did not answer within 100 ms');
  assert.equal(late.page.scene.grabs, grabs);
  // A frame presented as taken without the ticket of its own admission: the check is not asked; the capture ends.
  const forged = await app();
  assert.equal(await forged.page.arm(), true);
  const from = { sender: forged.s.overlay.webContents };
  assert.deepEqual(plain(await forged.h.handlers['lc:admit-frame']!(from, 'post', 5, { ticket: '0'.repeat(32), raw_sha256: 'a'.repeat(64), width: 1280, height: 800 })), { ok: false });
  await forged.ended();
  assert.deepEqual([forged.c().of('post_acquire').length, forged.state().ended], [0, 'the test\'s source check ended the capture: a frame was presented as taken without the ticket of its own admission, or with facts that are not its own']);
  // A ticket for another sample, or used twice.
  for (const misuse of ['other sample', 'twice'] as const) {
    const w = await app();
    assert.equal(await w.page.arm(), true);
    const by = { sender: w.s.overlay.webContents };
    const t = plain(await w.h.handlers['lc:admit-frame']!(by, 'pre', 7, { holding: [] })) as { ok: boolean; ticket: string };
    assert.equal(t.ok, true);
    const facts = { ticket: t.ticket, raw_sha256: 'b'.repeat(64), width: 1280, height: 800 };
    if (misuse === 'twice') assert.deepEqual(plain(await w.h.handlers['lc:admit-frame']!(by, 'post', 7, facts)), { ok: true });
    assert.deepEqual(plain(await w.h.handlers['lc:admit-frame']!(by, 'post', misuse === 'twice' ? 7 : 8, facts)), { ok: false }, misuse);
    await w.ended();
    assert.equal(w.c().of('post_acquire').length, misuse === 'twice' ? 1 : 0, misuse);
  }
  // A malformed ask from the overlay.
  const bad = await app();
  assert.equal(await bad.page.arm(), true);
  assert.deepEqual(plain(await bad.h.handlers['lc:admit-frame']!({ sender: bad.s.overlay.webContents }, 'during', 1, null)), { ok: false });
  await bad.ended();
});

test('[synthetic checker] main uses a frame only if its own taking was admitted, with its pixels and size: a circle, a follow-up or a first look of a frame that was not is refused, nothing of it is kept, and the capture ends', async () => {
  const w = await app();
  assert.equal(await w.page.arm(), true);
  await w.change(90);
  await until('the first look', () => w.looks().length === 1);
  const post = w.c().of('post_acquire')[0]!;
  const from = { sender: w.s.overlay.webContents };
  const doc = w.page.review.state().doc;
  const facts = { region_dip: { x: 10, y: 10, width: 20, height: 10 }, frame_seq: 1, frame_captured_at: new Date().toISOString(), frame_width: 1280, frame_height: 800, raw_sha256: post.raw_sha256, ink_session: doc.id, ink_revision: doc.ink.revision, visible_strokes: doc.ink.visible.length };
  const png = Uint8Array.from(pngOf(1280, 800, 90));
  const ink = new TextEncoder().encode(JSON.stringify(doc));
  const live = w.live().since;
  // Its pixels are not the admitted ones: refused, and the capture ends; nothing of it is kept.
  const asksDir = path.join(w.folder(), 'asks');
  const r = plain(await w.h.handlers['lc:ask-selection']!(from, { ...facts, raw_sha256: 'c'.repeat(64) }, png, ink, live)) as { ok: boolean; reason: string };
  assert.deepEqual(r, { ok: false, reason: 'its frame was not admitted by the test\'s source check, so it was not kept' });
  await w.ended();
  assert.equal(fs.existsSync(asksDir) ? fs.readdirSync(asksDir).length : 0, 0);
  assert.match(w.state().ended ?? '', /frame 1 was to be used without an admitted taking of its own, or its pixels are not the admitted ones/);
  for (const [what, change] of [['another frame', { frame_seq: 2 }], ['another width', { frame_width: 640 }], ['another height', { frame_height: 400 }], ['no hash', { raw_sha256: null }]] as const) {
    const x = await app();
    assert.equal(await x.page.arm(), true);
    await x.change(90);
    const p = x.c().of('post_acquire')[0]!;
    const over = change as Record<string, unknown>;
    const got = plain(await x.h.handlers['lc:ask-selection']!({ sender: x.s.overlay.webContents }, { ...facts, raw_sha256: p.raw_sha256, ...over }, Uint8Array.from(pngOf(Number(over['frame_width'] ?? 1280), Number(over['frame_height'] ?? 800), 90)), ink, x.live().since)) as { ok: boolean };
    assert.equal(got.ok, false, what);
    await x.ended();
  }
  // The same for a first look offered with a frame that was not admitted (the AI started after the screen was kept,
  // so its first look is still owed).
  const f = await app({ ai: false });
  assert.equal(await f.page.arm(), true);
  await f.change(90);
  assert.deepEqual(plain(await f.press('lc:live-start', POLICY)), { ok: true });
  const fp = f.c().of('post_acquire')[0]!;
  const offered = plain(await f.h.handlers['lc:look-frame']!({ sender: f.s.overlay.webContents }, { ...facts, frame_captured_at: new Date(Date.now() + 1000).toISOString(), frame_seq: 5, raw_sha256: fp.raw_sha256, live_session_id: (f.state().live as { id?: string } | undefined)?.id, stream_new_frame: false, stream_frame_age_ms: 3 }, png, ink));
  assert.deepEqual(offered, { ok: false });
  await f.ended();
  assert.equal(f.looks().length, 0);
});

test('[synthetic checker] a Stop while a decision is out or waiting its turn takes, keeps and sends nothing: before the taking, after it, and before a send (an AI-only Stop included, which is no violation)', async () => {
  // Stopped while the admission before the taking is out: the frame is not taken.
  const a = await app({ configure: (x) => x.holdPhases.add('pre_acquire') });
  assert.equal(await a.page.arm(), true);
  const grabs = a.page.scene.grabs;
  const s1 = a.page.review.sample();
  await until('asked', () => a.c().of('pre_acquire').length === 1);
  a.h.end('stopped by the test');
  a.c().reply(a.c().waiting());
  await s1;
  await a.ended();
  assert.deepEqual([a.page.scene.grabs, a.c().of('post_acquire').length, a.state().ended], [grabs, 0, 'stopped by the test'], 'a Stop is not a violation');
  assert.equal(a.record().some((l) => l['kind'] === 'violation'), false);
  // Stopped while the admission after the taking is out: taken, not kept.
  const b = await app({ configure: (x) => x.holdPhases.add('post_acquire') });
  assert.equal(await b.page.arm(), true);
  b.page.scene.shade = 90;
  const s2 = b.page.review.sample();
  await until('asked', () => b.c().of('post_acquire').length === 1);
  b.h.end('stopped by the test');
  b.c().reply(b.c().waiting());
  await s2;
  await b.page.review.pending();
  await b.ended();
  assert.deepEqual([b.page.review.retention().retained, b.frames(), b.looks().length], [0, [], 0]);
  // The AI is stopped (the capture goes on) while a look's admission before its send is out: not sent, said as
  // not looked at; then a new Start of the AI is admitted and sent again as usual.
  const c = await app({ configure: (x) => x.holdPhases.add('send') });
  assert.equal(await c.page.arm(), true);
  await c.change(90);
  await until('asked before the send', () => c.c().of('send').length === 1);
  c.press('lc:live-stop');
  c.c().reply(c.c().waiting());
  await until('settled', () => c.live().out === 0);
  assert.deepEqual([c.connector().count('companion/turn'), c.h.current() !== null], [0, true]);
  const notLooked = c.jsonl('live.jsonl').find((l) => l['kind'] === 'settled' || l['kind'] === 'not_looked')!;
  assert.deepEqual([notLooked['status'], notLooked['submission']], ['cancelled', 'not_submitted']);
  // A decision waiting its turn behind one that is out is withdrawn by a Stop: never written.
  const d = await app({ configure: (x) => x.holdPhases.add('send') });
  assert.equal(await d.page.arm(), true);
  await d.change(90);
  await until('asked before the send', () => d.c().of('send').length === 1);
  d.page.scene.shade = 140;
  const s4 = d.page.review.sample(); // its admission before the taking waits behind the send's
  await settle();
  assert.equal(d.c().of('pre_acquire').length, 1, 'queued, not written');
  d.h.end('stopped by the test');
  d.c().reply(d.c().waiting());
  await s4;
  await d.ended();
  assert.deepEqual([d.c().of('pre_acquire').length, d.connector().count('companion/turn'), d.page.scene.grabs], [1, 0, 1]);
  assert.deepEqual(decisions(d), [['arm', null, true], ['pre_acquire', null, true], ['post_acquire', 1, true], ['send', 1, true]]);
});

test('[synthetic checker] a look, a circle, its follow-up on the same reused frame, and a delayed (coalesced) frame each name the admitted frame they come from, with their ink: the picture sent is the composed one, the frame named is its raw source', async () => {
  const w = await app();
  assert.equal(await w.page.arm(), true);
  await w.change(90);
  await until('the first look', () => w.looks().length === 1);
  w.connector().see('A page.');
  await until('seen', () => w.live().out === 0);
  // Ink, then a change: the frame kept is composed with the ink; the look sends that composed picture and names its raw frame.
  w.page.press('WRITE');
  w.page.pointer('pointerdown', 1, 600, 500);
  for (const x of [640, 680]) w.page.pointer('pointermove', 1, x, 500);
  w.page.pointer('pointerup', 1, 680, 500);
  await w.page.review.pending();
  await w.change(140);
  w.h.fire(500);
  await until('the second look', () => w.looks().length === 2);
  const lookSend = w.c().of('send')[1]!;
  const retained = w.jsonl('manifest.jsonl').filter((l) => l['kind'] === 'retained');
  const kept = retained.find((l) => (l['composed'] as { sha256?: string } | null)?.sha256 === w.looks()[1]!.image.sha256)!;
  assert.ok(kept, 'the picture sent is a kept composed frame');
  assert.deepEqual([lookSend.frame_seq, lookSend.raw_sha256, lookSend.image_sha256], [kept['frame_seq'], (kept['raw'] as { pixels_sha256: string }).pixels_sha256, w.looks()[1]!.image.sha256]);
  assert.ok((kept['composed'] as { ink_original?: { sha256?: string } }).ink_original?.sha256, 'composed with the ink, whose original is kept with it');
  const inked = w.record().filter((l) => l['phase'] === 'send')[1]!;
  assert.ok((inked['ink_revision'] as number) >= 1 && typeof inked['ink_sha256'] === 'string', 'its ink, recorded with it');
  w.connector().see('A page with ink.');
  await until('seen', () => w.live().out === 0);
  // A circle on the frame held now (reused: nothing is taken for it): its request names that frame.
  const held = w.c().of('post_acquire').at(-1)!;
  const taken = w.c().of('post_acquire').length;
  await w.select();
  const circle = w.c().of('send').at(-1)!;
  assert.deepEqual([circle.frame_seq, circle.raw_sha256, circle.request_id, circle.image_sha256, w.c().of('post_acquire').length], [held.frame_seq, held.raw_sha256, w.asks()[0]!.request_id, w.asks()[0]!.image.sha256, taken]);
  w.connector().answer('A hint.');
  await until('answered', () => w.page.ask().answer === 'A hint.');
  // A follow-up on the unchanged screen: the same frame, admitted again just before its send.
  w.page.question('And then?');
  w.page.click('askSubmit');
  await until('sent', () => w.asks().length === 2);
  const follow = w.c().of('send').at(-1)!;
  assert.deepEqual([follow.frame_seq, follow.raw_sha256, follow.request_id, follow.image_sha256, w.c().of('post_acquire').length], [held.frame_seq, held.raw_sha256, w.asks()[1]!.request_id, w.asks()[1]!.image.sha256, taken]);
  w.connector().answer('Then this.');
  await until('answered', () => w.page.ask().answer === 'Then this.');
  // Delayed and coalesced: frames kept while a look is out; the older one waiting is replaced; the newer one is sent
  // later, naming its own taking.
  w.page.click('close');
  w.page.press('NAV');
  w.h.fire(500);
  await w.change(170);
  await until('a look out', () => w.looks().length === 3);
  await w.change(200);
  await w.change(230);
  const [f2, f3] = w.c().of('post_acquire').slice(-2);
  w.connector().see('Another page.');
  await until('seen', () => w.live().out === 0);
  w.h.fire(500);
  await until('the delayed look', () => w.looks().length === 4);
  const delayed = w.c().of('send').at(-1)!;
  assert.deepEqual([delayed.frame_seq, delayed.raw_sha256, delayed.request_id], [f3!.frame_seq, f3!.raw_sha256, w.looks()[3]!.request_id]);
  assert.notEqual(f2!.frame_seq, delayed.frame_seq);
  assert.equal(w.jsonl('live.jsonl').some((l) => l['kind'] === 'gap' && l['reason'] === 'coalesced'), true);
});

test('[synthetic checker] the checker ends with its capture (its end recorded; one not seen is said as that, not as an end), a new explicit Start runs a new one; its own end, or a decision that cannot be recorded, ends the capture at once', async () => {
  const w = await app();
  assert.equal(await w.page.arm(), true);
  await w.change(90);
  w.h.end('stopped by the test');
  await w.ended();
  await until('its end recorded', () => w.record().some((l) => l['kind'] === 'checker_end'));
  assert.deepEqual([w.c().inputEnded, w.c().kills, w.record().at(-1)], [true, 0, { ...w.record().at(-1), kind: 'checker_end', exit_seen: true, code: 0, signal: null, killed: false }]);
  // A new Start is the user's own; it runs a new checker when it is armed.
  assert.deepEqual(plain(await w.h.start('screen:1:0', { policy: POLICY })), { ok: true });
  const next = w.h.current() as { overlay: FakeWindow };
  assert.equal(plain(await w.h.handlers['lc:arm-capture']!({ sender: next.overlay.webContents })), true);
  assert.deepEqual([w.checkers.made.length, w.checkers.last().of('arm').length], [2, 1]);

  // One that does not end, even when killed: its end is not seen.
  const stuck = await app({ configure: (x) => {
    x.ignoresEnd = true;
    x.kill = () => ((x.kills += 1), true);
  } });
  assert.equal(await stuck.page.arm(), true);
  stuck.h.end('stopped by the test');
  await stuck.ended();
  await until('its end recorded', () => stuck.record().some((l) => l['kind'] === 'checker_end'), 6000);
  assert.deepEqual(stuck.record().find((l) => l['kind'] === 'checker_end')!['exit_seen'], false);
  assert.equal(stuck.c().kills, 1, 'this child alone');

  // Its own end while the capture runs: the capture ends at once.
  const dies = await app();
  assert.equal(await dies.page.arm(), true);
  dies.c().exit(1);
  await dies.ended();
  assert.match(dies.state().ended ?? '', /^the test's source check ended the capture: the source check (ended|closed its output)$/);

  // A decision that cannot be recorded on this device is not allowed: the capture ends.
  const unrecorded = await app();
  assert.equal(await unrecorded.page.arm(), true);
  unrecorded.h.failWrites.only = 'admission.jsonl';
  unrecorded.h.failWrites.partialAppend = 12; // the next line is torn: 12 bytes of it are written, then the write fails
  const grabs = unrecorded.page.scene.grabs;
  await unrecorded.change(90);
  await unrecorded.ended();
  assert.equal(unrecorded.state().ended, 'the test\'s source check ended the capture: a decision of the source check could not be recorded on this device');
  assert.deepEqual([unrecorded.frames().length, unrecorded.page.scene.grabs - grabs], [0, 0], 'no frame was taken');
  await until('its end recorded', () => unrecorded.record().some((l) => l['kind'] === 'checker_end'));
  assert.deepEqual(unrecorded.record().map((l) => [l['kind'], l['phase'] ?? null]), [['decision', 'arm'], ['violation', null], ['checker_end', null]], 'the torn line was cut back: whole lines only');
});

/** A circle in ASK whose own request is not waited for (its send may be held by the checker). */
function circle(w: Awaited<ReturnType<typeof app>>, x = 190, width = 210): void {
  w.page.press('ASK');
  w.page.pointer('pointerdown', 2, x, 95);
  for (const [px, py] of [[x + width, 95], [x + width, 125], [x, 125]] as const) w.page.pointer('pointermove', 2, px, py);
  w.page.pointer('pointerup', 2, x + 2, 97);
}
/** The next append to admission.jsonl is torn (12 bytes written, then it fails). */
const tearNextRecord = (w: Awaited<ReturnType<typeof app>>): void => {
  w.h.failWrites.only = 'admission.jsonl';
  w.h.failWrites.partialAppend = 12;
};
const UNRECORDED = 'the test\'s source check ended the capture: a decision of the source check could not be recorded on this device';

test('[synthetic checker] main binds this capture\'s overlay window at arm (its process and native handle, from main, echoed exactly), says read-only which capture is checked and whether it is now, and a new capture binds anew', async () => {
  const w = await app();
  const before = w.state().source_admission!;
  assert.deepEqual([before.capture_id, before.overlay, before.active], [path.basename(w.folder()), null, false], 'not armed yet');
  assert.equal(await w.page.arm(), true);
  const hwnd = String(0x10000 + (w.s.overlay as unknown as { id: number }).id);
  const arm = w.c().of('arm')[0]!;
  assert.deepEqual(arm.overlay, { pid: process.pid, hwnd });
  assert.deepEqual(w.state().source_admission, { capture_id: before.capture_id, overlay: { pid: process.pid, hwnd }, active: true });
  assert.notEqual(w.state().source_admission!.capture_id, (plain(w.press('lc:session-state')) as { session_id: string }).session_id, 'the capture, not the window id');
  await w.change(90);
  assert.deepEqual(w.c().requests.filter((r) => r.phase !== 'arm').map((r) => r.overlay), [null, null, null], 'only arm carries it');
  // While the capture ends: not active; after it: not said at all.
  w.h.end('stopped by the test');
  assert.deepEqual([w.state().ending, w.state().source_admission!.active], [true, false]);
  await w.ended();
  assert.equal('source_admission' in w.state(), false);
  // A new capture: another capture, another window, bound anew; the old window can ask nothing.
  assert.deepEqual(plain(await w.h.start('screen:1:0', { policy: POLICY })), { ok: true });
  const next = w.h.current() as { overlay: FakeWindow };
  assert.equal(plain(await w.h.handlers['lc:arm-capture']!({ sender: next.overlay.webContents })), true);
  const arm2 = w.checkers.last().of('arm')[0]!;
  assert.notEqual(arm2.capture_id, arm.capture_id);
  assert.deepEqual(arm2.overlay, { pid: process.pid, hwnd: String(0x10000 + next.overlay.id) });
  assert.notEqual((arm2.overlay as { hwnd: string }).hwnd, hwnd);
  assert.deepEqual(plain(await w.h.handlers['lc:admit-frame']!({ sender: w.s.overlay.webContents }, 'pre', 1, null)), { ok: false });
  assert.equal(w.checkers.last().of('pre_acquire').length, 0);
  // An answer that echoes another window: rejected, not armed, and the capture ends.
  const wrong = await app({ configure: (x) => x.holdPhases.add('arm') });
  const arming = wrong.page.arm();
  await until('asked', () => wrong.c().of('arm').length === 1);
  wrong.c().reply(wrong.c().waiting(), { overlay: { pid: process.pid, hwnd: '1' } });
  assert.equal(await arming, false);
  await wrong.ended();
  assert.match(wrong.state().ended ?? '', /not to the request that is waiting \(overlay\)/);
  // Stopped before it was armed: no checker, and no record.
  const early = await app();
  early.h.end('stopped by the test');
  await early.ended();
  await settle();
  assert.deepEqual([early.checkers.made.length, fs.existsSync(path.join(early.folder(), 'admission.jsonl'))], [0, false]);
});

test('[synthetic checker] main refuses, at its own intakes, a frame kept or a follow-up sent with pixels that were not admitted, even from its own overlay; a follow-up on a later frame names that frame\'s own taking', async () => {
  // A retained frame whose hash is not the admitted one: refused, nothing written, and the capture ends.
  const r = await app();
  assert.equal(await r.page.arm(), true);
  const retain = r.h.handlers['lc:retain-frame']!;
  r.h.handlers['lc:retain-frame'] = (e: unknown, facts: unknown, ...rest: unknown[]) => retain(e, { ...(facts as object), raw: { ...(facts as { raw: object }).raw, pixels_sha256: 'd'.repeat(64) } }, ...rest);
  await r.change(90);
  await r.ended();
  assert.match(r.state().ended ?? '', /frame 1 was to be used without an admitted taking of its own/);
  assert.deepEqual([r.frames(), r.looks().length], [[], 0]);
  // A follow-up whose picture claims a hash that was not admitted: not sent, and the capture ends.
  const f = await app();
  assert.equal(await f.page.arm(), true);
  await f.change(90);
  await until('the first look', () => f.looks().length === 1);
  f.connector().see('A page.');
  await until('seen', () => f.live().out === 0);
  await f.select();
  f.connector().answer('A hint.');
  await until('answered', () => f.page.ask().answer === 'A hint.');
  const submit = f.h.handlers['lc:ask-submit']!;
  f.h.handlers['lc:ask-submit'] = (e: unknown, id: unknown, q: unknown, as: unknown, facts: unknown, ...rest: unknown[]) => submit(e, id, q, as, { ...(facts as object), raw_sha256: 'e'.repeat(64) }, ...rest);
  f.page.question('And then?');
  f.page.click('askSubmit');
  await f.ended();
  assert.deepEqual([f.asks().length, f.c().of('send').length], [1, 2]);
  // A follow-up after the screen changed names the newer frame's own taking, and sends its picture.
  const later = await app();
  assert.equal(await later.page.arm(), true);
  await later.change(90);
  await until('the first look', () => later.looks().length === 1);
  later.connector().see('A page.');
  await until('seen', () => later.live().out === 0);
  await later.select();
  later.connector().answer('A hint.');
  await until('answered', () => later.page.ask().answer === 'A hint.');
  later.page.press('NAV');
  await later.change(140);
  const newest = later.c().of('post_acquire').at(-1)!;
  later.page.question('And now?');
  later.page.click('askSubmit');
  await until('sent', () => later.asks().length === 2);
  const send = later.c().of('send').at(-1)!;
  assert.deepEqual([send.frame_seq, send.raw_sha256, send.image_sha256, send.request_id], [newest.frame_seq, newest.raw_sha256, later.asks()[1]!.image.sha256, later.asks()[1]!.request_id]);
  assert.notEqual(send.frame_seq, later.c().of('send')[1]!.frame_seq, 'not the circle\'s frame');
});

test('[synthetic checker] the ticket: used once, consumed before its decision is awaited, and only the one main issued; main itself checks again after that decision (a Stop meanwhile admits nothing)', async () => {
  // A second presentation of the same ticket while the first is still being decided: refused at once.
  const twice = await app({ configure: (x) => x.holdPhases.add('post_acquire') });
  assert.equal(await twice.page.arm(), true);
  const by = { sender: twice.s.overlay.webContents };
  const t = plain(await twice.h.handlers['lc:admit-frame']!(by, 'pre', 7, { holding: [] })) as { ticket: string };
  const facts = { ticket: t.ticket, raw_sha256: 'b'.repeat(64), width: 1280, height: 800 };
  const first = twice.h.handlers['lc:admit-frame']!(by, 'post', 7, facts) as Promise<unknown>;
  await until('asked', () => twice.c().of('post_acquire').length === 1);
  const again = await Promise.race([twice.h.handlers['lc:admit-frame']!(by, 'post', 7, facts) as Promise<unknown>, new Promise((r) => setTimeout(() => r('still waiting'), 300))]);
  assert.deepEqual(plain(again), { ok: false });
  twice.c().reply(twice.c().waiting());
  assert.deepEqual(plain(await first), { ok: false }, 'the capture was already ending');
  await twice.ended();
  // A ticket main never issued, for the right sample: refused, not asked.
  const forged = await app();
  assert.equal(await forged.page.arm(), true);
  const from = { sender: forged.s.overlay.webContents };
  assert.equal((plain(await forged.h.handlers['lc:admit-frame']!(from, 'pre', 7, { holding: [] })) as { ok: boolean }).ok, true);
  assert.deepEqual(plain(await forged.h.handlers['lc:admit-frame']!(from, 'post', 7, { ticket: '0'.repeat(32), raw_sha256: 'b'.repeat(64), width: 1280, height: 800 })), { ok: false });
  await forged.ended();
  assert.equal(forged.c().of('post_acquire').length, 0);
  // A Stop while the decision after the taking is out: main admits nothing, whatever the overlay does.
  const stop = await app({ configure: (x) => x.holdPhases.add('post_acquire') });
  assert.equal(await stop.page.arm(), true);
  const via = { sender: stop.s.overlay.webContents };
  const tk = plain(await stop.h.handlers['lc:admit-frame']!(via, 'pre', 7, { holding: [] })) as { ticket: string };
  const post = stop.h.handlers['lc:admit-frame']!(via, 'post', 7, { ticket: tk.ticket, raw_sha256: 'b'.repeat(64), width: 1280, height: 800 }) as Promise<unknown>;
  await until('asked', () => stop.c().of('post_acquire').length === 1);
  stop.h.end('stopped by the test');
  stop.c().reply(stop.c().waiting());
  assert.deepEqual(plain(await post), { ok: false });
});

test('[synthetic checker] a decision that cannot be recorded ends the capture at every phase (arm, after a taking, before a send), also when the AI was stopped meanwhile; nothing of it is kept or sent', async () => {
  const arm = await app();
  tearNextRecord(arm);
  assert.equal(await arm.page.arm(), false);
  await arm.ended();
  assert.equal(arm.state().ended, UNRECORDED);
  const post = await app({ configure: (x) => x.holdPhases.add('post_acquire') });
  assert.equal(await post.page.arm(), true);
  post.page.scene.shade = 90;
  const taking = post.page.review.sample();
  await until('asked', () => post.c().of('post_acquire').length === 1);
  tearNextRecord(post);
  post.c().reply(post.c().waiting());
  await taking;
  await post.ended();
  assert.deepEqual([post.state().ended, post.frames()], [UNRECORDED, []]);
  for (const aiStopped of [false, true]) {
    const send = await app({ configure: (x) => x.holdPhases.add('send') });
    assert.equal(await send.page.arm(), true);
    await send.change(90);
    await until('asked before the send', () => send.c().of('send').length === 1);
    if (aiStopped) send.press('lc:live-stop');
    tearNextRecord(send);
    send.c().reply(send.c().waiting());
    await send.ended();
    assert.deepEqual([send.state().ended, send.connector().count('companion/turn')], [UNRECORDED, 0], `AI stopped meanwhile: ${aiStopped}`);
  }
});

test('[synthetic checker] cancelling a circle while its send is being admitted sends nothing, and a follow-up on the unchanged screen still carries the circle; an AI-only Stop withdraws a send waiting its turn; the least time between looks runs from the send', async () => {
  const w = await app();
  assert.equal(await w.page.arm(), true);
  await w.change(90);
  await until('the first look', () => w.looks().length === 1);
  w.connector().see('A page.');
  await until('seen', () => w.live().out === 0);
  w.c().holdPhases.add('send');
  circle(w);
  await until('its send is being admitted', () => w.c().of('send').length === 2);
  await until('acknowledged', () => /^Asked at/.test(w.page.ask().status ?? ''));
  w.page.click('askCancel');
  w.c().reply(w.c().waiting());
  await until('settled', () => w.live().out === 0);
  assert.equal(w.asks().length, 0, 'never sent');
  const rec = JSON.parse(fs.readFileSync(path.join(w.folder(), 'asks', fs.readdirSync(path.join(w.folder(), 'asks')).find((n) => n.endsWith('.json'))!), 'utf8')) as { requests: Array<Record<string, unknown>> };
  assert.equal(rec.requests[0]!['submission'], 'not_submitted');
  w.c().holdPhases.delete('send');
  w.page.question('So?');
  w.page.click('askSubmit');
  await until('sent', () => w.asks().length === 1);
  const follow = w.asks()[0]!;
  assert.ok(follow.focus !== null, 'the circle goes with it, on its own unchanged frame');
  assert.equal(follow.context.frame_seq, follow.focus!.frame_seq);

  // An AI-only Stop while a look's send is being admitted: the circle's send waiting behind it is never written.
  const q = await app({ configure: (x) => x.holdPhases.add('send') });
  assert.equal(await q.page.arm(), true);
  await q.change(90);
  await until('the look\'s send is out', () => q.c().of('send').length === 1);
  circle(q);
  await until('the card', () => q.page.ask().form);
  await settle();
  q.press('lc:live-stop');
  q.c().reply(q.c().waiting());
  await until('settled', () => q.live().out === 0);
  assert.deepEqual([q.c().of('send').length, q.connector().count('companion/turn'), q.h.current() !== null], [1, 0, true]);

  // The least time between two looks starts when the first is sent, after its admission (however long that took).
  const c = await app({ configure: (x) => x.holdPhases.add('send') });
  assert.equal(await c.page.arm(), true);
  await c.change(90);
  await until('the look\'s send is out', () => c.c().of('send').length === 1);
  c.h.fire(500); // (no bound runs yet: nothing was sent)
  c.c().reply(c.c().waiting());
  await until('the first look', () => c.looks().length === 1);
  c.c().holdPhases.delete('send');
  await c.change(140);
  c.connector().see('A page.');
  await until('seen', () => c.live().out === 0);
  assert.equal(c.looks().length, 1, 'the second waits for the least time from the first send');
  c.h.fire(500);
  await until('the second look', () => c.looks().length === 2);
});

test('[synthetic checker] the overlay: the picture\'s hash is of the frame it took; frames the stream presented while the admission was out are that picture\'s; a pen-down meanwhile gets that frame as its start; a frame whose pixels cannot be read is closed, not held', async () => {
  const w = await app();
  assert.equal(await w.page.arm(), true);
  w.page.scene.luma = new Uint8Array(1280 * 800).fill(90);
  await w.change(90);
  w.page.scene.luma = new Uint8Array(1280 * 800).fill(140);
  await w.change(140);
  const [p1, p2] = w.c().of('post_acquire');
  assert.notEqual(p1!.raw_sha256, p2!.raw_sha256, 'each frame\'s own pixels');
  const retained = w.jsonl('manifest.jsonl').filter((l) => l['kind'] === 'retained').map((l) => (l['raw'] as { pixels_sha256: string }).pixels_sha256);
  assert.deepEqual(retained, [p1!.raw_sha256, p2!.raw_sha256]);
  // A frame presented while the admission before the taking was out: the picture taken after it is that frame.
  const f = await app({ configure: (x) => x.holdPhases.add('pre_acquire') });
  assert.equal(await f.page.arm(), true);
  f.page.scene.shade = 90;
  const s1 = f.page.review.sample();
  await until('asked', () => f.c().of('pre_acquire').length === 1);
  f.page.review.present();
  f.c().reply(f.c().waiting());
  await s1;
  await f.page.review.pending();
  await until('kept', () => f.jsonl('manifest.jsonl').some((l) => l['kind'] === 'retained'));
  const kept = f.jsonl('manifest.jsonl').find((l) => l['kind'] === 'retained')!;
  assert.deepEqual([kept['presented_frames'], kept['stream_presented_frames']], [2, 2]);
  // A pen-down while a sample's admission is out: the frame that sample takes (after the pen-down) is the stroke's start.
  const p = await app();
  assert.equal(await p.page.arm(), true);
  await p.change(90);
  p.c().holdPhases.add('pre_acquire');
  p.page.press('WRITE');
  p.page.scene.shade = 120;
  const s2 = p.page.review.sample();
  await until('asked', () => p.c().of('pre_acquire').length === 2);
  p.page.pointer('pointerdown', 1, 300, 300);
  p.c().reply(p.c().waiting());
  await s2;
  p.c().holdPhases.delete('pre_acquire');
  for (const x of [340, 380]) p.page.pointer('pointermove', 1, x, 300);
  p.page.pointer('pointerup', 1, 380, 300);
  await p.page.review.pending();
  const evidence = Object.values(p.page.review.state().doc.evidence);
  assert.equal(evidence.length, 1);
  assert.ok(evidence[0] && evidence[0].contexts.length >= 1 && evidence[0].contexts[0]!.reason === 'writing_started', 'its start is the frame taken after the pen-down');
  // Its pixels cannot be read back to be admitted: the frame is closed, never held; the capture goes on.
  const h = await app();
  assert.equal(await h.page.arm(), true);
  h.page.scene.hashFails = 1;
  h.page.scene.shade = 90;
  await h.page.review.sample().catch(() => undefined);
  assert.deepEqual([h.page.scene.lastGrab!.width, h.c().of('post_acquire').length, h.h.current() !== null], [0, 0, true]);
});

test('[synthetic checker] the app\'s quit waits for a checker that is still ending (within its bound), and then quits', async () => {
  const checkers = fakeCheckers((x) => {
    x.ignoresEnd = true;
    x.kill = () => ((x.kills += 1), true);
  });
  const h = harness({ env: { LC_SOURCE_ADMISSION: admissionConfig() }, admission: { spawn: checkers.spawn, endMs: 50 } });
  await started();
  const s = await running(h);
  await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 }, { admission: true });
  assert.equal(plain(await h.handlers['lc:arm-capture']!({ sender: s.overlay.webContents })), true);
  h.app.quit();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(h.quits.n, 0, 'held for the checker\'s end');
  await until('the app quit', () => h.quits.n === 1, 6000);
  assert.equal(checkers.last().kills, 1);
});

test('[synthetic checker] the overlay holds a frame only when the main process admitted it, and never once its capture ended, whatever the order the answers come in; a decision refused unasked after a failure is not recorded as a decision', async () => {
  // The admission after the taking is not given (the call fails, or says no) while the capture goes on: not held.
  const no = await app();
  assert.equal(await no.page.arm(), true);
  const admitFrame = no.h.handlers['lc:admit-frame']!;
  no.h.handlers['lc:admit-frame'] = async (e: unknown, phase: unknown, ...rest: unknown[]) => (phase === 'post' ? { ok: false } : admitFrame(e, phase, ...rest));
  await no.change(90);
  await no.page.review.pending();
  await settle();
  assert.deepEqual([no.page.scene.lastGrab!.width, no.page.review.retention().retained, no.frames(), no.h.current() !== null], [0, 0, [], true], 'closed, never kept');
  // The capture ended while that admission was out, and an "admitted" answer still arrives: not held either.
  const late = await app();
  assert.equal(await late.page.arm(), true);
  let release = (): void => undefined;
  const held = new Promise<void>((r) => (release = r));
  const admit2 = late.h.handlers['lc:admit-frame']!;
  late.h.handlers['lc:admit-frame'] = async (e: unknown, phase: unknown, ...rest: unknown[]) => {
    if (phase !== 'post') return admit2(e, phase, ...rest);
    await held;
    return { ok: true };
  };
  late.page.scene.shade = 90;
  const sampling = late.page.review.sample();
  await until('the frame is taken', () => late.page.scene.grabs === 1);
  late.h.end('stopped by the test');
  await settle();
  release();
  await sampling;
  await late.page.review.pending();
  assert.deepEqual([late.page.scene.lastGrab!.width, late.page.review.retention().retained], [0, 0]);
  // A send refused by the checker: the decision waiting behind it is refused unasked, and not recorded as one.
  const q = await app({ configure: (x) => x.holdPhases.add('send') });
  assert.equal(await q.page.arm(), true);
  await q.change(90);
  await until('the look\'s send is out', () => q.c().of('send').length === 1);
  q.page.scene.shade = 140;
  const behind = q.page.review.sample(); // its admission before the taking waits behind the send's
  await settle();
  q.c().reply(q.c().waiting(), { verdict: 'deny', reason: 'not in front' });
  await behind;
  await q.ended();
  await until('its end recorded', () => q.record().some((l) => l['kind'] === 'checker_end'));
  assert.deepEqual(q.record().map((l) => [l['kind'], l['phase'] ?? null]), [['decision', 'arm'], ['decision', 'pre_acquire'], ['decision', 'post_acquire'], ['decision', 'send'], ['violation', null], ['checker_end', null]]);
  assert.equal(q.c().of('pre_acquire').length, 1, 'never asked');
});

test('[synthetic checker] an "allow" whose checker already failed in the same read (its answer given again) allows nothing: no send reaches the connector and no frame is admitted; the decision and then the violation are recorded', async () => {
  /** The waiting request's "allow", written twice in one piece of output. */
  const allowTwice = (c: FakeChecker): void => {
    const line = JSON.stringify({ ...echo(c.waiting()), verdict: 'allow', reason: null });
    c.stdout.write(`${line}\n${line}\n`);
  };
  const send = await app({ configure: (x) => x.holdPhases.add('send') });
  assert.equal(await send.page.arm(), true);
  await send.change(90);
  await until('asked before the send', () => send.c().of('send').length === 1);
  allowTwice(send.c());
  await send.ended();
  assert.deepEqual([send.connector().count('companion/turn'), send.state().ended], [0, 'the test\'s source check ended the capture: the source check answered a request again']);
  await until('its end recorded', () => send.record().some((l) => l['kind'] === 'checker_end'));
  assert.deepEqual(send.record().slice(-3).map((l) => [l['kind'], l['phase'] ?? null, l['allowed'] ?? null]), [['decision', 'send', true], ['violation', null, null], ['checker_end', null, null]]);
  const post = await app({ configure: (x) => x.holdPhases.add('post_acquire') });
  assert.equal(await post.page.arm(), true);
  post.page.scene.shade = 90;
  const taking = post.page.review.sample();
  await until('asked after the taking', () => post.c().of('post_acquire').length === 1);
  allowTwice(post.c());
  await taking;
  await post.page.review.pending();
  await post.ended();
  assert.deepEqual([post.page.scene.lastGrab!.width, post.page.review.retention().retained, post.frames()], [0, 0, []]);
});

test('[synthetic checker] a frame the stream presented while the admission before a taking was out makes that sample fresh, not still; with none, it stays still', async () => {
  for (const [what, presentMeanwhile, state] of [['a frame meanwhile', true, 'fresh'], ['none', false, 'no_new_frame']] as const) {
    const w = await app({ configure: (x) => x.holdPhases.add('pre_acquire') });
    assert.equal(await w.page.arm(), true);
    w.page.scene.shade = 90;
    const sampling = w.page.review.sameFrameLate(0); // (nothing held yet: a frame is taken, with no new frame before it)
    await until('asked', () => w.c().of('pre_acquire').length === 1);
    if (presentMeanwhile) w.page.review.present();
    w.c().reply(w.c().waiting());
    await sampling;
    await w.page.review.pending();
    await until('kept', () => w.jsonl('manifest.jsonl').some((l) => l['kind'] === 'retained'));
    const kept = w.jsonl('manifest.jsonl').find((l) => l['kind'] === 'retained')!;
    assert.deepEqual([kept['state'], kept['presented_frames']], [state, presentMeanwhile ? 1 : 0], what);
  }
});

test('[synthetic checker] an admission is kept while the overlay still holds or uses its frame, however many frames are taken meanwhile (a slow picture of frame 1 after 70 more); one the overlay lets go is refused later; what it says it holds is checked', async () => {
  const w = await app();
  assert.equal(await w.page.arm(), true);
  let release = (): void => undefined;
  w.page.encoding.gate = new Promise<void>((r) => (release = r)); // (pictures are made slowly)
  await w.change(90);
  for (let i = 0; i < 70; i += 1) await w.change(100 + (i % 2) * 40);
  assert.ok(w.c().of('post_acquire').length >= 71);
  w.page.encoding.gate = null;
  release();
  await until('frame 1 kept', () => w.jsonl('manifest.jsonl').some((l) => l['kind'] === 'retained' && l['frame_seq'] === 1));
  assert.equal(w.h.current() !== null, true, 'still running');
  // An overlay that does not say it still uses frame 1: its later picture of frame 1 is refused, and the capture ends.
  const lies = await app();
  assert.equal(await lies.page.arm(), true);
  const admitFrame = lies.h.handlers['lc:admit-frame']!;
  lies.h.handlers['lc:admit-frame'] = (e: unknown, phase: unknown, seq: unknown, facts: unknown) => admitFrame(e, phase, seq, phase === 'pre' ? { holding: [] } : facts);
  let let1 = (): void => undefined;
  lies.page.encoding.gate = new Promise<void>((r) => (let1 = r));
  await lies.change(90);
  await lies.change(140);
  lies.page.encoding.gate = null;
  let1();
  await lies.ended();
  assert.match(lies.state().ended ?? '', /frame 1 was to be used without an admitted taking of its own/);
  assert.equal(lies.jsonl('manifest.jsonl').some((l) => l['kind'] === 'retained' && l['frame_seq'] === 1), false);
  // What the overlay says it holds: at most 16 earlier frames, each an earlier sample; else the capture ends.
  for (const [what, facts] of [['missing', null], ['not a list', { holding: 3 }], ['a later frame', { holding: [7] }], ['too many', { holding: Array.from({ length: 17 }, (_, i) => i + 1) }], ['another member', { holding: [], more: 1 }]] as const) {
    const x = await app();
    assert.equal(await x.page.arm(), true);
    assert.deepEqual(plain(await x.h.handlers['lc:admit-frame']!({ sender: x.s.overlay.webContents }, 'pre', 7, facts)), { ok: false }, what);
    await x.ended();
    assert.equal(x.c().of('pre_acquire').length, 0, what);
  }
});
