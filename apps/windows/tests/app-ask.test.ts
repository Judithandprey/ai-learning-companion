// ASK with the managed ChatGPT subscription, through the app: the real main.ts and overlay.ts under the unit-test
// fakes. A circle is retained as the WHOLE composed frame it was drawn on, the facts of that frame, the circle as its
// focus and the exact ink. With no AI session nothing is sent, and the card says why; with the session running the
// circle itself asks for a small hint, once, and never for more than a hint; a follow-up in the user's own words goes
// only on the user's press. A response is shown only on the card of the selection and request it belongs to; Cancel,
// a new selection, Stop and the session's end fence unsent work and suppress late responses; nothing is sent again.
// (The AI's session itself, its unattended looks and its own bounds are in tests/app-live.test.ts.)
// SYNTHETIC: the connector is a stand-in (tests/subscription-fakes.ts). No Codex, no ChatGPT, no sign-in and no
// network are involved, and every "answer" is text this test wrote.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { deferred, harness, plain, quitLinks, running, settle, type FakeWindow } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { controlPage } from './control-page.ts';
import { png as pngOf } from './png.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { parseDesktopInk } from '../src/shared/desktop-ink.ts';
import { bucket, connectorConfig, fakeConnectors, removeConfigs, type FakeConnector } from './subscription-fakes.ts';
import { LIVE_LINE_FROM_CONNECTOR_MAX, type Focus, type LiveContext, type Policy, type Turn } from '../src/shared/live.ts';

after(quitLinks);
after(removeConfigs);
const sha = (b: Uint8Array | string): string => crypto.createHash('sha256').update(b).digest('hex');
type Sub = { mode: string; state?: string; login?: string; model?: string | null; asking?: boolean; detail?: string | null };
/** The AI's session, as the control window is told (main.ts, liveInfo). */
/** The AI session that runs, by when it was started: what the overlay says with every request it makes in it. */
const during = (w: { live(): { id?: string } }): string => w.live().id!;
type Live = { id?: string; since?: string; state: string; reason?: string | null; used?: number; ended?: string | null; out?: number; frames?: number };
type Kept = { file: string; sha256: string; bytes: number; width: number; height: number };
type Outcome = { status: string; answer?: { request_id: string; text: string; model: string; latency_ms: number }; code?: string; reason?: string; uncertain?: boolean };
/** One request of a selection's record (asks/<selection>.json). */
type Entry = {
  request_id: string; trigger: string; question: string | null; assistance: string; asked_as: string; model: string | null; live_session_id: string;
  frame: { frame_seq: number; sample_seq: number; captured_at: string | null; image: Kept; ink_original: unknown; focus: string };
  submitted_at: string; ended_at: string | null; outcome: Outcome | null; submission?: string; shown: boolean; presentation?: string;
};
type Rec = { format: string; selection_id: string; selected_at: string; sample_seq: number; image: Kept; context: LiveContext; focus: Focus; ink_original: { file?: string; sha256?: string; refused?: string }; requests: Entry[] };

/** The session's own bounds, as the user would set them beside Start. */
const POLICY: Policy = { max_submissions: 60, max_session_ms: 1_800_000, min_observation_interval_ms: 30_000 };
/** The whole fake display, in DIP and (1:1) in pixels of its frames. */
const WHOLE = { x: 0, y: 0, width: 1280, height: 800 };
/** The circle `select()` draws by default (the pointer goes 190..400 × 95..125; a region is padded by 8). */
const CIRCLE = { x: 182, y: 87, width: 226, height: 46 };
// What the card says (src/renderer/overlay.ts).
const HINT_ASKED = /^Asked at .* \(vision-model\): the whole display with this part as your focus, for a small hint\. Waiting for the response…$/;
const FOLLOW_UP_ASKED = /^Asked at .* \(vision-model\): the whole display and your question are being sent to ChatGPT\. Waiting for the response…$/;
const SENDING = 'Sending the whole display as it is now and your question to ChatGPT…';
/** When the overlay page's first frame was taken (tests/overlay-page.ts). */
const FRAME_AT = '2026-09-30T12:00:00.000Z';
/**
 * What the card says of a response: the model, how long it took, and WHEN the whole frame it is about was taken (a
 * response is about the picture it was asked with, never about the newest screen); `circle`: what it adds when the
 * card's circle is not on that frame.
 */
const answered = (capturedAt: string | null, circle = ''): string => `From ChatGPT (vision-model) in 1.2 s, about the whole display as it was at ${new Date(capturedAt!).toLocaleTimeString()}.${circle}`;
const ANSWERED = answered(FRAME_AT);
const CIRCLE_EARLIER = ' The screen had changed since your circle: ChatGPT was told where the circle was, without its pixels.';
const CIRCLE_NOT_SENT = ' Your circle was not part of this request.';
const CANCELLED = 'Cancelled: no answer is shown.';
const UNCONFIRMED = `${CANCELLED} Whether ChatGPT stopped working on it is not confirmed; it may still have counted against your usage.`;
/** A request merely not taken (the connector's `busy`): said, and the AI's session goes on. */
const NOT_TAKEN = 'No answer: another request of yours is still waiting, so this one was not taken. It did not reach ChatGPT; it is not sent again.';
/** Said with a "Not sent" while an earlier response is still the one on the card: which picture that response is about stays said. */
const STILL = ` The response still shown is the one before: ${ANSWERED}`;
const NOT_STARTED = 'the AI is not started; start it in the control window';

/**
 * The app with the subscription configured and a stand-in connector. By default the subscription is checked first
 * (signed in), THEN the capture is started together with the AI's session, within POLICY (or `policy`), and the
 * session is on before the overlay page is made. `ai: false`: the capture alone (signed in, no AI session).
 * `check: false`: nothing is checked before Start (with `ai: true`, the Start still asks for the AI).
 */
async function app(o: { check?: boolean; ai?: boolean; policy?: Policy; configure?: (c: FakeConnector) => void; leaky?: boolean; ask_ms?: number } = {}) {
  const fakes = fakeConnectors(o.configure);
  const h = harness({ env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig() }, subscription: { spawn: fakes.spawn, request_ms: 500, ask_ms: o.ask_ms ?? 20_000, end_ms: 500 }, ...(o.leaky ? { leakySubscription: true } : {}) });
  await settle(); // the app starts: its control window is there before any Start
  const control = h.control() as unknown as FakeWindow;
  const press = (channel: string, ...args: unknown[]): unknown => h.handlers[channel]!({ sender: control.webContents }, ...args);
  const sub = (): Sub => plain(press('lc:sub-state')) as Sub;
  const live = (): Live => (plain(press('lc:session-state')) as { live?: Live }).live ?? { state: 'no capture' };
  if (o.check !== false) {
    press('lc:sub-check');
    await until('signed in', () => sub().state === 'signed_in', 3000);
  }
  const ai = o.ai ?? o.check !== false;
  const s = await running(h, ai ? { policy: o.policy ?? POLICY } : null);
  // (its session starts in a later task: on when signed in; else said as not started, with why)
  if (ai) await until('the AI session is on, or said as not started', () => live().state === (o.check === false ? 'off' : 'on'), 3000);
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  page.scene.exactPng = true;
  const captures = path.join(h.userData, 'captures');
  const folder = (): string => path.join(captures, fs.readdirSync(captures)[0]!);
  /** The selections' records on this device, oldest first. */
  const records = (): Rec[] =>
    fs.existsSync(path.join(folder(), 'asks'))
      ? fs.readdirSync(path.join(folder(), 'asks')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(folder(), 'asks', f), 'utf8')) as Rec).sort((a, b) => (a.selected_at < b.selected_at ? -1 : a.selected_at > b.selected_at ? 1 : 0))
      : [];
  const record = (id: string | null): Rec => records().find((r) => r.selection_id === id)!;
  /** What the AI session wrote of itself (live.jsonl), line by line. */
  const lines = (): Array<Record<string, unknown>> => (fs.existsSync(path.join(folder(), 'live.jsonl')) ? fs.readFileSync(path.join(folder(), 'live.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : []);
  const c = (): FakeConnector => fakes.last();
  /** The user's own requests as they went to the connector (a circle's hint, a follow-up): never an unattended look. */
  const asks = (): Turn[] => (fakes.made.at(-1)?.asks() ?? []).map((x) => x.params as unknown as Turn);
  /** The circle itself, as the user draws it: nothing is waited for. */
  const circle = (x = 190, width = 210): void => {
    page.press('ASK');
    page.pointer('pointerdown', 2, x, 95);
    for (const [px, py] of [[x + width, 95], [x + width, 125], [x, 125]] as const) page.pointer('pointermove', 2, px, py);
    page.pointer('pointerup', 2, x + 2, 97);
  };
  /**
   * An ASK circle on the overlay. Resolves once its own card says what became of it: kept (the follow-up form is
   * there; with the AI's session running its own request has gone out by then), or the reason it could not be kept.
   * Gives the selection's id (null when it was not kept).
   */
  const select = async (x = 190, width = 210): Promise<string | null> => {
    const known = new Set(records().map((r) => r.selection_id));
    const before = asks().length;
    circle(x, width);
    // This selection's own card (not one still open from before): a new card hides the form until the main process answered.
    await until('the ASK card', () => page.review.card()?.text.includes(`Region ${x - 8},87 `) === true && (page.ask().form || /could not be kept/.test(page.ask().status ?? '')));
    if (/^Asked at/.test(page.ask().status ?? '')) await until('the circle\'s own request at the connector', () => asks().length === before + 1);
    return records().find((r) => !known.has(r.selection_id))?.selection_id ?? null;
  };
  /** A follow-up in the user's words, typed and sent with the card's own button (once the card can send). */
  const followUp = async (text: string, assistance?: 'hint' | 'explain' | 'full_solution'): Promise<void> => {
    await until('the card can send a follow-up', () => page.ask().form && page.ask().submit);
    page.question(text);
    if (assistance) page.choose(assistance);
    page.click('askSubmit');
  };
  return { h, s, fakes, c, page, press, sub, live, folder, records, record, lines, asks, circle, select, followUp, control };
}

test('without the subscription configured nothing changes: no follow-up form, nothing retained for ASK, no AI session even when Start asks for one, and the requests are refused', async () => {
  const h = harness();
  const s = await running(h, { policy: POLICY }); // a Start that asks for the AI: there is none to start
  const control = { sender: (h.control() as unknown as FakeWindow).webContents };
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  page.review.mode('ASK');
  page.pointer('pointerdown', 2, 190, 95);
  for (const [x, y] of [[400, 95], [400, 125], [190, 125]] as const) page.pointer('pointermove', 2, x, y);
  page.pointer('pointerup', 2, 192, 97);
  await until('the ASK card', () => page.review.card() !== null);
  assert.match(page.review.card()!.text, /^No AI is connected: this selection was not sent anywhere\.\n/);
  assert.deepEqual([page.ask().form, page.ask().badge, page.ask().status], [false, 'Selection · no AI connected', null]);
  assert.match(page.hint() ?? '', /No AI is connected\./);
  assert.deepEqual(plain(await h.handlers['lc:ask-selection']!({ sender: s.overlay.webContents }, {}, new Uint8Array(4), new Uint8Array(2))), { ok: false, reason: 'no AI is connected' });
  assert.deepEqual(plain(await h.handlers['lc:ask-submit']!({ sender: s.overlay.webContents }, 'ask-x', 'q', 'hint')), { ok: false, reason: 'no AI is connected' });
  assert.deepEqual(plain(h.handlers['lc:sub-state']!(control)), { mode: 'off' });
  assert.deepEqual((plain(h.handlers['lc:session-state']!(control)) as { live: unknown }).live, { state: 'none' });
  assert.equal((plain(await h.handlers['lc:live-start']!(control, POLICY)) as { ok: boolean }).ok, false, 'nor by Start the AI');
  const captures = path.join(h.userData, 'captures');
  assert.equal(fs.existsSync(captures) && fs.readdirSync(captures).some((d) => fs.existsSync(path.join(captures, d, 'asks')) || fs.existsSync(path.join(captures, d, 'live.jsonl'))), false);
});

test('[synthetic connector] not checked: capturing, writing, erasing and selecting send nothing to any AI; a Start that asks for the AI starts none and says why; no connector is even started until the user presses', async () => {
  const NOT_CHECKED = 'the ChatGPT subscription has not been checked yet (use the control window)';
  const w = await app({ check: false, ai: true });
  assert.deepEqual([w.sub().state, w.fakes.made.length, w.live()], ['not_checked', 0, { state: 'off', reason: NOT_CHECKED, unwritten: 0 }]);
  // Frames are sampled and retained, a stroke is written and erased, undone and redone.
  await w.page.review.sample();
  w.page.pointer('pointerdown', 1, 100, 200);
  for (const x of [140, 180, 220]) w.page.pointer('pointermove', 1, x, 200);
  w.page.pointer('pointerup', 1, 220, 200);
  await w.page.review.pending();
  w.page.scene.shade = 60;
  await w.page.review.sample();
  await w.page.review.retention().queue;
  w.page.click('undo');
  w.page.click('redo');
  await w.page.review.pending();
  // A selection is retained on this device; its card says why the AI was not asked, and nothing was sent.
  await w.select();
  assert.equal(w.fakes.made.length, 0, 'no connector child at all');
  assert.equal(w.records().length, 1, 'the selection is kept on this device');
  assert.deepEqual(w.records()[0]!.requests, []);
  assert.equal(w.page.ask().status, `Kept on this device. The AI was not asked: the AI is not started (${NOT_CHECKED}); start it in the control window.`);
  assert.deepEqual([w.page.ask().form, w.page.ask().submit, w.page.ask().cancel, w.page.ask().badge, w.page.ask().answer], [true, true, false, 'Your focus on the screen', null]);
  assert.match(w.page.hint() ?? '', /No AI observes this display: the ChatGPT subscription has not been checked yet \(use the control window\)\./);
  // A follow-up typed and sent while not checked: refused here, still nothing started.
  await w.followUp('What is this?');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, `Not sent: the AI is not started (${NOT_CHECKED}); start it in the control window.`);
  assert.deepEqual([w.fakes.made.length, w.records()[0]!.requests], [0, []]);
  // The session that was not started is said in its own record too, and that is all of it.
  assert.deepEqual(w.lines().map((l) => [l['kind'], l['code'], l['reason']]), [['not_started', 'local', NOT_CHECKED]]);
});

test('[synthetic connector] a circle is retained as the whole composed frame, the facts of that frame, the circle as its focus and the exact ink drawn into it; the mode before returns at once', async () => {
  const w = await app();
  // A stroke first, so the ink document is not empty.
  w.page.pointer('pointerdown', 1, 200, 105);
  for (const x of [240, 280]) w.page.pointer('pointermove', 1, x, 105);
  w.page.pointer('pointerup', 1, 280, 105);
  await w.page.review.pending();
  await w.select();
  assert.equal(w.page.review.state().doc.ink.revision >= 1, true);
  assert.deepEqual([w.page.ask().form, w.page.ask().submit, w.page.ask().cancel], [true, false, true], 'the follow-up form is there; it sends nothing while the circle\'s own request is out');
  assert.match(w.page.hint() ?? '', /Pen writes|Pen and mouse write/, 'WRITE, the mode before, is back while the card stays');
  assert.match(w.page.review.card()!.text, /^Your focus: this part of the screen\. With the AI running, ChatGPT is given the whole display as it was then, with this part marked, and asked for a small hint; nothing more than a hint is asked for by a circle alone\.\n/);
  assert.equal(w.page.ask().badge, 'Your focus · a hint is being asked for');
  assert.match(w.page.hint() ?? '', /ChatGPT observes this whole display as it changes: 60 of 60 requests and about 30 min left in this session \(its own bounds, not ChatGPT's quota\); it has not looked yet\./);
  const [r] = w.records();
  assert.equal(r!.format, 'lc-windows-live-focus/v1');
  // The picture: the WHOLE frame as the overlay composed it, content-addressed under asks/; its bytes hash to the name.
  const png = fs.readFileSync(path.join(w.folder(), r!.image.file));
  assert.deepEqual(r!.image, { file: `asks/${sha(png)}.png`, sha256: sha(png), bytes: png.length, width: 1280, height: 800 });
  assert.equal(png.equals(Buffer.from(pngOf(1280, 800, 20))), true, 'exactly the bytes the overlay made of the whole display (the fake screen\'s shade)');
  // Its context is the whole display, never the circle; the circle is the focus: a rectangle of that same frame.
  const c = r!.context;
  assert.deepEqual([c.capture_session_id, c.frame_seq, c.frame_width, c.frame_height, c.display.bounds, c.display.scale_factor, r!.sample_seq], [path.basename(w.folder()), 1, 1280, 800, WHOLE, 1, 1]);
  assert.deepEqual([c.region_dip, c.region_px], [WHOLE, WHOLE]);
  assert.deepEqual(r!.focus, { frame_seq: 1, region_dip: CIRCLE, region_px: CIRCLE });
  assert.deepEqual([c.frame_captured_at, c.source_url, c.source_version, c.media_position], ['2026-09-30T12:00:00.000Z', null, null, null], 'the frame\'s own time; nothing unknown is made up');
  // The ink: the exact document drawn into the frame, read back strictly, bound by its hash and revision.
  const ink = fs.readFileSync(path.join(w.folder(), r!.ink_original.file!));
  assert.deepEqual([sha(ink), r!.ink_original.sha256], [c.ink_sha256, c.ink_sha256]);
  const doc = JSON.parse(ink.toString('utf8'));
  const read = parseDesktopInk(doc, sha(doc.id));
  assert.equal(read.ok && read.doc.ink.revision, c.ink_revision);
  assert.deepEqual([w.asks().length, w.c().looks().length], [1, 0], 'one request went with it: the circle\'s own');
});

test('[synthetic connector] with the AI\'s session running the circle itself asks, once, for a small hint: the whole frame with the circle as its focus is what is sent; the response is shown as text on its own card, apart from the selection, and recorded', async () => {
  const w = await app();
  await w.select();
  assert.equal(w.asks().length, 1, 'no second press and no typed question');
  const turn = w.asks()[0]!;
  const start = w.c().calls.find((x) => x.method === 'companion/start')!.params;
  const [r] = w.records();
  assert.deepEqual(start, { session_id: start['session_id'], capture_session_id: path.basename(w.folder()), epoch: 1, model: 'vision-model', policy: POLICY, permissions: { screen: true, microphone: false, system_audio: false } });
  // What was sent is what the main process retained, not what a page could claim: in the session the user started,
  // for a hint and nothing more, with no words of the user's.
  assert.deepEqual(Object.keys(turn).sort(), ['allowed_assistance', 'audio_source', 'context', 'epoch', 'focus', 'gaps', 'history', 'image', 'permission_revision', 'presentation', 'request_id', 'session_id', 'trigger', 'user_text']);
  assert.deepEqual([turn.trigger, turn.allowed_assistance, turn.user_text, turn.presentation, turn.audio_source, turn.session_id, turn.epoch, turn.permission_revision], ['focus', 'hint', null, 'silent', null, start['session_id'], 1, 1]);
  const png = fs.readFileSync(path.join(w.folder(), r!.image.file));
  assert.deepEqual([Buffer.from(turn.image.png_base64, 'base64').equals(png), turn.image.sha256, turn.image.width, turn.image.height], [true, r!.image.sha256, 1280, 800], 'the whole frame is the picture');
  assert.deepEqual([turn.context, turn.context.region_px, turn.context.region_dip], [r!.context, WHOLE, WHOLE], 'its context is the whole display');
  assert.deepEqual([turn.focus, r!.focus], [{ frame_seq: turn.context.frame_seq, region_dip: CIRCLE, region_px: CIRCLE }, turn.focus], 'the circle is the focus: a rectangle of that same frame');
  assert.deepEqual([turn.history, turn.gaps], [[], []]);
  const asked = r!.requests[0]!;
  assert.deepEqual({ ...asked, submitted_at: '' }, { request_id: `${r!.selection_id}.1`, trigger: 'focus', question: null, assistance: 'hint', asked_as: 'silent', model: 'vision-model', live_session_id: start['session_id'], frame: { frame_seq: 1, sample_seq: 1, captured_at: '2026-09-30T12:00:00.000Z', image: r!.image, ink_original: r!.ink_original, focus: 'on_this_frame' }, submitted_at: '', ended_at: null, outcome: null, shown: false }, 'written before it was sent');
  assert.equal(turn.request_id, asked.request_id);
  assert.equal(w.page.ask().badge, 'Your focus · a hint is being asked for');
  assert.deepEqual([w.page.ask().submit, w.page.ask().cancel], [false, true]);
  assert.match(w.page.ask().status ?? '', HINT_ASKED);
  assert.deepEqual([w.sub().asking, w.live().out, w.live().used], [true, 1, 0]);
  const card = w.page.review.card()!.text;
  w.c().answer('It shows <b>a number line</b> from 0 to 5.');
  await until('answered', () => w.page.ask().answer !== null);
  assert.equal(w.page.ask().answer, 'It shows <b>a number line</b> from 0 to 5.', 'as text, never markup');
  assert.equal(w.page.ask().status, ANSWERED);
  assert.deepEqual([w.page.review.card()!.text, w.page.ask().submit, w.page.ask().cancel, w.page.ask().badge], [card, true, false, 'Your focus · ChatGPT\'s response is below'], 'the selection\'s own text is unchanged; a follow-up may be sent');
  await until('recorded as shown', () => w.records()[0]!.requests[0]!.shown);
  const entry = w.records()[0]!.requests[0]!;
  assert.deepEqual([entry.outcome, entry.submission, entry.shown, entry.presentation, entry.model], [{ status: 'answered', answer: { request_id: turn.request_id, text: 'It shows <b>a number line</b> from 0 to 5.', model: 'vision-model', latency_ms: 1234 } }, 'submitted', true, 'shown', 'vision-model']);
  assert.deepEqual(fs.readFileSync(path.join(w.folder(), r!.image.file)), png, 'the original picture is untouched');
  assert.deepEqual([w.asks().length, w.c().count('companion/turn'), w.live().state, w.live().used, w.sub().asking], [1, 1, 'on', 1, false], 'sent once; it used one of the session\'s own requests');
});

test('[synthetic connector] a follow-up in the user\'s words on the same unchanged frame keeps the circle as its focus: the same frame, the help chosen, and the first response as what the assistant said (shown), with no words put in the user\'s mouth for the circle', async () => {
  const w = await app();
  const id = await w.select();
  const first = w.asks()[0]!;
  w.c().answer('Look at the unit first.');
  await until('shown, and recorded as shown', () => w.record(id).requests[0]!.shown);
  assert.equal(w.page.node('question').value, '', 'the follow-up starts empty: nothing is typed for the user');
  await w.followUp('  What does this show?  ', 'explain');
  await until('sent', () => w.asks().length === 2);
  const next = w.asks()[1]!;
  assert.deepEqual([next.trigger, next.user_text, next.allowed_assistance, next.presentation, next.session_id, next.epoch, next.request_id], ['text_followup', 'What does this show?', 'explain', 'silent', first.session_id, 1, `${id}.2`]);
  assert.deepEqual([next.focus, next.context, next.context.frame_seq, next.image], [first.focus, first.context, first.context.frame_seq, first.image], 'the same frame, and the circle still its focus');
  assert.deepEqual(next.history, [{ kind: 'assistant', text: 'Look at the unit first.', at: next.history[0]!.at, frame_seq: first.context.frame_seq, request_id: first.request_id, audio_source: null, presentation: 'shown' }], 'what the assistant said, as it was shown; the circle had no words of the user\'s');
  assert.deepEqual(next.gaps, []);
  await until('acknowledged', () => FOLLOW_UP_ASKED.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().badge, w.page.ask().submit, w.page.ask().cancel, w.page.ask().answer, w.page.node('question').value], ['Your focus · asked: being sent to ChatGPT', false, true, null, '']);
  const [hint, asked] = w.record(id).requests;
  assert.deepEqual([asked!.request_id, asked!.trigger, asked!.question, asked!.assistance, asked!.live_session_id, asked!.frame, asked!.outcome], [next.request_id, 'text_followup', 'What does this show?', 'explain', first.session_id, hint!.frame, null], 'written before it was sent, about the same frame, with the circle on it');
  assert.deepEqual(fs.readdirSync(path.join(w.folder(), 'asks')).filter((f) => f.endsWith('.png')), [`${first.image.sha256}.png`], 'no second picture is kept for the same frame');
  w.c().answer('It shows a number line.');
  await until('answered', () => w.page.ask().answer === 'It shows a number line.');
  await until('recorded as shown', () => w.record(id).requests[1]!.shown);
  assert.equal(w.page.ask().status, ANSWERED, 'about the frame the circle is on: nothing more is said of the circle');
  // What was asked and what was answered join the conversation the next request carries.
  await w.followUp('And the arrow?');
  await until('sent', () => w.asks().length === 3);
  const third = w.asks()[2]!;
  assert.deepEqual(third.history.map((x) => [x.kind, x.text, x.request_id, x.presentation]), [['assistant', 'Look at the unit first.', first.request_id, 'shown'], ['user', 'What does this show?', next.request_id, null], ['assistant', 'It shows a number line.', next.request_id, 'shown']]);
  assert.deepEqual([third.allowed_assistance, third.focus, third.context], ['explain', first.focus, first.context], 'the help chosen stays as chosen on this card');
  assert.deepEqual([w.live().frames, w.live().used, w.c().looks().length], [1, 2, 0], 'one frame of the session, asked about three times');
});

test('[synthetic connector] a follow-up after the screen or the ink changed is about a LATER frame: its focus is null, and the circle stays bound to its own frame, only named as an earlier focus whose pixels are not attached', async () => {
  for (const changed of ['the screen', 'the ink'] as const) {
    const w = await app();
    const id = await w.select();
    const first = w.asks()[0]!;
    w.c().answer('A hint about the circled part.');
    await until('shown, and recorded as shown', () => w.record(id).requests[0]!.shown);
    if (changed === 'the screen') {
      // The display shows something else, and a sample of it passes (it is also kept, and offered to the AI as a look).
      w.page.scene.shade = 90;
      await w.page.review.sample();
      await w.page.review.pending();
      await w.page.review.retention().queue;
      await until('the unattended look', () => w.c().looks().length === 1);
    } else {
      // The same picture of the display; a stroke is written over it.
      w.page.pointer('pointerdown', 1, 500, 400);
      for (const x of [540, 580]) w.page.pointer('pointermove', 1, x, 400);
      w.page.pointer('pointerup', 1, 580, 400);
      await w.page.review.pending();
    }
    await w.followUp('And now?');
    await until('sent', () => w.asks().length === 2);
    const next = w.asks()[1]!;
    assert.deepEqual([next.trigger, next.user_text, next.focus, next.session_id], ['text_followup', 'And now?', null, first.session_id], `${changed}: no rectangle of the old frame is put on the new one`);
    assert.equal(next.context.frame_seq > first.context.frame_seq, true, `${changed}: a later frame of the session`);
    // (A look that is out does not hold the user's own request back; it is no request of the user's, and no gap yet.)
    assert.deepEqual([w.c().looks().length, w.live().out, next.gaps], changed === 'the screen' ? [1, 2, []] : [0, 1, []]);
    assert.deepEqual([next.context.region_px, next.context.region_dip], [WHOLE, WHOLE]);
    if (changed === 'the screen') assert.notEqual(next.image.sha256, first.image.sha256);
    else assert.deepEqual([next.image.sha256, next.context.ink_revision === first.context.ink_revision, next.context.ink_sha256 === first.context.ink_sha256], [first.image.sha256, false, false]);
    // One entry of the conversation names the earlier focus: where it was, on which frame, and that its pixels are not here.
    assert.deepEqual(next.history.map((x) => x.kind), ['assistant', 'observation'], changed);
    const named = next.history.at(-1)!;
    assert.deepEqual([named.frame_seq, named.request_id, named.at, named.presentation], [first.context.frame_seq, first.request_id, first.context.frame_captured_at, 'not_presented']);
    const reference = JSON.parse(named.text) as Record<string, unknown>;
    assert.deepEqual([reference['kind'], reference['pixels_attached_to_this_request'], reference['provider_retention'], reference['request_id'], reference['focus'], reference['context'], reference['image']], ['historical_focus_reference', false, 'unverified', first.request_id, first.focus, first.context, { sha256: first.image.sha256, width: 1280, height: 800 }]);
    assert.equal(named.text.includes('png_base64'), false);
    // The record: the follow-up's own frame is kept, and says the circle is on an earlier one; the selection is as it was.
    const r = w.record(id);
    const asked = r.requests[1]!;
    assert.deepEqual([asked.trigger, asked.question, asked.frame.focus, asked.frame.frame_seq, asked.frame.image.sha256], ['text_followup', 'And now?', 'on_an_earlier_frame', next.context.frame_seq, next.image.sha256], changed);
    assert.equal(sha(fs.readFileSync(path.join(w.folder(), asked.frame.image.file))), next.image.sha256, 'the later frame is on this device too');
    assert.deepEqual([r.context, r.focus, r.requests[0]!.frame.focus], [first.context, first.focus, 'on_this_frame']);
    w.c().answer('About the display as it is now.');
    await until('answered', () => w.page.ask().answer === 'About the display as it is now.');
    // The card says which picture the response is about (its time, not "now"), and that the circle's pixels were not in it.
    assert.equal(w.page.ask().status, answered(next.context.frame_captured_at, CIRCLE_EARLIER), changed);
    assert.equal(changed === 'the screen' ? next.context.frame_captured_at !== FRAME_AT : next.context.frame_captured_at === FRAME_AT, true, `${changed}: the time of the frame that was sent`);
  }
});

test('[synthetic connector] a circle alone never asks for more than a hint, whatever help is chosen on the card or claimed by a page: the choice applies to the follow-up only', async () => {
  const w = await app();
  w.page.choose('full_solution'); // chosen before the circle
  const id = await w.select();
  assert.deepEqual([w.asks()[0]!.trigger, w.asks()[0]!.allowed_assistance, w.asks()[0]!.user_text, w.record(id).requests[0]!.assistance], ['focus', 'hint', null, 'hint']);
  w.page.choose('full_solution'); // chosen while the circle's own request is out: that request is as it was sent
  w.c().answer('Only a hint.');
  await until('answered', () => w.page.ask().answer === 'Only a hint.');
  assert.equal(w.asks().length, 1);
  // The follow-up, in the user's own words, carries the help chosen.
  await w.followUp('Solve it for me.');
  await until('sent', () => w.asks().length === 2);
  assert.deepEqual([w.asks()[1]!.trigger, w.asks()[1]!.allowed_assistance, w.asks()[1]!.user_text, w.record(id).requests[1]!.assistance], ['text_followup', 'full_solution', 'Solve it for me.', 'full_solution']);
  w.c().answer('The solution.');
  await until('answered', () => w.page.ask().answer === 'The solution.');
  // A page that claims more with the circle itself gets a hint: the main process takes no kind of help from it.
  const doc = w.page.review.state().doc;
  const facts = { region_dip: CIRCLE, frame_seq: 1, frame_captured_at: '2026-09-30T12:00:00.000Z', frame_width: 1280, frame_height: 800, ink_session: doc.id, ink_revision: doc.ink.revision, visible_strokes: doc.ink.visible.length, assistance: 'full_solution', allowed_assistance: 'full_solution', trigger: 'text_followup', user_text: 'Solve it.' };
  const kept = plain(await w.h.handlers['lc:ask-selection']!({ sender: w.s.overlay.webContents }, facts, Uint8Array.from(pngOf(1280, 800, 20)), new TextEncoder().encode(JSON.stringify(doc)), during(w), 'full_solution')) as { ok: boolean; request?: { ok: boolean } };
  assert.deepEqual([kept.ok, kept.request?.ok], [true, true]);
  await until('sent', () => w.asks().length === 3);
  assert.deepEqual([w.asks()[2]!.trigger, w.asks()[2]!.allowed_assistance, w.asks()[2]!.user_text], ['focus', 'hint', null]);
});

test('[synthetic connector] Cancel while a request is out, the circle\'s own or a follow-up: the connector is told to interrupt it, its response is never shown, whatever arrives, and it is not sent again', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const id = await w.select();
  w.page.click('askCancel');
  assert.equal(w.page.ask().status, 'Cancelling: a response that still arrives is not shown.');
  await until('the connector is told', () => w.c().count('companion/interrupt') === 1);
  assert.deepEqual(w.c().calls.at(-1)!.params, { session_id: w.asks()[0]!.session_id, epoch: 1, request_id: `${id}.1` });
  w.c().answer('A late answer that must not be shown.');
  await until('ended', () => /^Cancelled/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, UNCONFIRMED, 'it was answered after all: nothing shows that ChatGPT stopped');
  assert.deepEqual([w.page.ask().answer, w.page.ask().badge, w.page.ask().submit, w.page.ask().cancel], [null, 'Your focus · asked: no response shown', true, false]);
  const entry = w.record(id).requests[0]!;
  assert.deepEqual([entry.outcome, entry.submission, entry.shown], [{ status: 'cancelled', uncertain: true }, 'submitted', false]);
  assert.equal(JSON.stringify(w.records()).includes('late answer'), false, 'not kept as an answer either');
  // A follow-up, cancelled; this time the connector ends it as cancelled and confirms the interruption.
  w.c().onCancel = 'confirmed';
  await w.followUp('What is this?');
  await until('sent', () => w.asks().length === 2);
  await until('acknowledged', () => FOLLOW_UP_ASKED.test(w.page.ask().status ?? ''));
  w.page.click('askCancel');
  await until('ended', () => /^Cancelled/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().answer, w.c().count('companion/interrupt')], [CANCELLED, null, 2]);
  assert.deepEqual(w.c().calls.filter((x) => x.method === 'companion/interrupt')[1]!.params, { session_id: w.asks()[0]!.session_id, epoch: 1, request_id: `${id}.2` });
  assert.deepEqual(w.record(id).requests.map((x) => [x.outcome, x.shown]), [[{ status: 'cancelled', uncertain: true }, false], [{ status: 'cancelled', uncertain: false }, false]]);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([w.asks().length, w.c().count('companion/turn'), w.live().state, w.c().count('companion/stop')], [2, 2, 'on', 0], 'neither is sent again; a cancel is not the session\'s end');
});

test('[synthetic connector] a new selection while a request is out: the first is interrupted, the new circle asks for its own hint, and the first one\'s late response is never shown on the new card', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const one = await w.select();
  const first = w.c().asks()[0]!;
  const two = await w.select(600, 120); // another region: a new selection, a new card
  await until('the first interrupted', () => w.c().count('companion/interrupt') === 1);
  assert.deepEqual(w.c().calls.find((x) => x.method === 'companion/interrupt')!.params, { session_id: w.asks()[0]!.session_id, epoch: 1, request_id: `${one}.1` });
  assert.equal(w.asks().length, 2, 'the new circle\'s own request went out at once');
  assert.deepEqual([w.page.ask().form, w.page.ask().submit, w.page.ask().cancel, w.page.ask().answer, w.page.ask().badge], [true, false, true, null, 'Your focus · a hint is being asked for']);
  w.c().answer('The answer to the FIRST selection.', undefined, first);
  await until('the first ended', () => w.record(one).requests[0]!.outcome !== null);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(w.page.ask().answer, null, 'nothing of the first request on the new card');
  assert.match(w.page.ask().status ?? '', HINT_ASKED, 'the new card still says its own request is out');
  assert.equal(w.records().length, 2);
  assert.deepEqual([w.record(one).requests[0]!.outcome, w.record(one).requests[0]!.shown, JSON.stringify(w.records()).includes('FIRST selection')], [{ status: 'cancelled', uncertain: true }, false, false]);
  // The new circle is a new focus on the whole display: the same whole picture, another rectangle.
  const second = w.asks()[1]!;
  assert.deepEqual([second.request_id, second.trigger, second.focus?.region_dip, second.context.region_px, second.image.sha256], [`${two}.1`, 'focus', { x: 592, y: 87, width: 136, height: 46 }, WHOLE, w.asks()[0]!.image.sha256]);
  w.c().answer('The answer to the second selection.');
  await until('answered', () => w.page.ask().answer !== null);
  assert.equal(w.page.ask().answer, 'The answer to the second selection.');
});

test('[synthetic connector] Stop while a request is out: the capture is fenced, its AI session ends with it and the connector is told, a late response is never shown, and nothing more is asked', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const id = await w.select();
  const session = w.asks()[0]!.session_id;
  const folder = w.folder();
  w.h.end('stopped by the test');
  await until('told', () => w.c().count('companion/stop') === 1);
  assert.deepEqual(w.c().calls.find((x) => x.method === 'companion/stop')!.params, { session_id: session, epoch: 1 });
  w.c().answer('An answer after the Stop.');
  await until('ended', () => w.sub().asking === false);
  await until('the capture ended', () => w.h.current() === null, 5000);
  assert.equal(w.page.ask().answer, null);
  const entry = w.record(id).requests[0]!;
  assert.deepEqual([entry.outcome, entry.shown, JSON.stringify(w.records()).includes('after the Stop')], [{ status: 'cancelled', uncertain: true }, false, false]);
  assert.deepEqual(fs.readFileSync(path.join(folder, 'live.jsonl'), 'utf8').trim().split('\n').map((l) => [(JSON.parse(l) as { kind: string }).kind, (JSON.parse(l) as { reason?: string }).reason ?? null]), [['started', null], ['ended', 'the capture was stopped'], ['settled', null]]); // (the request that was out settles after the end, as a line of its own)
  // The same session never asks again.
  assert.deepEqual(plain(await w.h.handlers['lc:ask-submit']!({ sender: w.s.overlay.webContents }, id, 'again?', 'hint')), { ok: false, reason: 'refused' });
  assert.deepEqual([w.asks().length, w.c().count('companion/turn'), w.c().count('companion/start'), w.c().count('companion/stop')], [1, 1, 1, 1]);
});

test('[synthetic connector] the user stops the AI while a circle\'s request is out, the capture going on: the connector is told, the late response is never shown, a circle then says why it is not asked, and only the user starts the AI again', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const one = await w.select();
  const session = w.asks()[0]!.session_id;
  w.press('lc:live-stop');
  await until('told', () => w.c().count('companion/stop') === 1);
  assert.deepEqual([w.c().calls.at(-1)!.params, w.live().state, w.live().ended, w.h.current() !== null], [{ session_id: session, epoch: 1 }, 'ended', 'stopped by you', true]);
  w.c().answer('An answer after the AI was stopped.');
  await until('said', () => /^Cancelled/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().answer], [UNCONFIRMED, null]);
  assert.deepEqual([w.record(one).requests[0]!.outcome, w.record(one).requests[0]!.shown, JSON.stringify(w.records()).includes('was stopped.')], [{ status: 'cancelled', uncertain: true }, false, false]);
  await until('said in the toolbar', () => /ChatGPT no longer observes this display: stopped by you\. Start the AI again in the control window\./.test(w.page.hint() ?? ''));
  // With no AI session nothing is sent, and it is said why: a follow-up, and a new circle.
  const ENDED = 'the AI session has ended (stopped by you); start it again in the control window';
  await w.followUp('And this?');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, `Not sent: ${ENDED}.`);
  const two = await w.select(600, 120);
  assert.deepEqual([w.page.ask().status, w.page.ask().form, w.page.ask().submit, w.page.ask().cancel, w.record(two).requests], [`Kept on this device. The AI was not asked: ${ENDED}.`, true, true, false, []]);
  assert.deepEqual([w.asks().length, w.c().count('companion/turn'), w.c().count('companion/start')], [1, 1, 1], 'nothing was sent, and nothing started the AI again');
  // The user starts the AI again: a new session. The picture and the ink are still the ones this card's circle was
  // made on, and the circle never went out in this session: it is worked out anew on this frame and is the
  // follow-up's focus (the user circled exactly these pixels).
  assert.deepEqual(plain(await w.press('lc:live-start', POLICY)), { ok: true });
  await w.followUp('What is this?');
  await until('sent', () => w.asks().length === 2);
  const next = w.asks()[1]!;
  assert.deepEqual([next.session_id !== session, next.trigger, next.user_text, next.allowed_assistance, next.focus, next.history, next.context.region_px, next.request_id], [true, 'text_followup', 'What is this?', 'hint', { frame_seq: next.context.frame_seq, region_dip: w.record(two).focus.region_dip, region_px: w.record(two).focus.region_px }, [], WHOLE, `${two}.1`]);
  assert.deepEqual([w.record(two).requests[0]!.frame.focus, w.record(two).requests[0]!.live_session_id], ['on_this_frame', next.session_id]);
  w.c().answer('About the whole display.');
  await until('answered', () => w.page.ask().answer === 'About the whole display.');
  assert.equal(w.page.ask().status, answered(next.context.frame_captured_at), 'the circle was part of this request');
});

test('[synthetic connector] the app\'s own fence, whatever the connector layer does: a response for a replaced selection, or after Stop, is not shown and its text not kept', async () => {
  // The subscription layer here forgets every interrupt and Stop (a fault), so the responses do come back to the app.
  const w = await app({ leaky: true });
  const one = await w.select();
  const first = w.c().asks()[0]!;
  const two = await w.select(600, 120);
  assert.deepEqual([w.asks().length, w.c().count('companion/interrupt')], [2, 0]);
  w.c().answer('The answer to the FIRST selection.', undefined, first);
  await until('the first ended', () => w.record(one).requests[0]!.outcome !== null);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(w.page.ask().answer, null, 'not shown on the new card');
  assert.match(w.page.ask().status ?? '', HINT_ASKED);
  assert.equal(JSON.stringify(w.records()).includes('FIRST selection'), false, 'nor kept as an answer');
  // After Stop: the same.
  w.h.end('stopped by the test');
  w.c().answer('An answer AFTER the Stop.');
  await until('ended', () => w.sub().asking === false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(w.page.ask().answer, null);
  assert.equal(JSON.stringify(w.records()).includes('AFTER the Stop'), false);
  assert.deepEqual([one, two].map((id) => w.record(id).requests.map((x) => [x.outcome?.status, x.shown])), [[['cancelled', false]], [['cancelled', false]]]);
  assert.equal(w.c().count('companion/stop'), 0, '(the fault: the connector was never told)');
});

test('[synthetic connector] the app\'s own fence, whatever the connector layer does: a response that comes after its AI session ended (stopped by the user, or its time over), the capture going on, is not shown and its text not kept', async () => {
  // The subscription layer here forgets every interrupt and Stop (a fault), so the response does come back to the app
  // as an answer: only the app's own check of the session keeps it from the card.
  for (const [end, reason, text] of [
    [(w: Awaited<ReturnType<typeof app>>) => void w.press('lc:live-stop'), 'stopped by you', 'An answer AFTER the AI was stopped.'],
    [(w: Awaited<ReturnType<typeof app>>) => w.h.fire(1_800_000), 'this session\'s time is over', 'An answer AFTER the time was over.'],
  ] as const) {
    const w = await app({ leaky: true });
    const id = await w.select();
    end(w);
    assert.deepEqual([w.live().state, w.live().ended, w.h.current() !== null], ['ended', reason, true]);
    w.c().answer(text);
    await until('ended', () => w.record(id).requests[0]!.outcome !== null);
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual([w.page.ask().answer, w.record(id).requests[0]!.outcome, w.record(id).requests[0]!.shown, JSON.stringify(w.records()).includes(text)], [null, { status: 'cancelled', uncertain: true }, false, false], reason);
    assert.match(w.page.ask().status ?? '', /^Cancelled: no answer is shown\./);
  }
});

test('[synthetic connector] refusals and an answer that never comes are said as they are, and never sent again by the app: one merely not taken leaves the AI on; any other ends its session until the user starts it again', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent'), ask_ms: 400 });
  const id = await w.select();
  // Not taken (the connector was busy): said; the session goes on, and none of its requests is used.
  w.c().fail(w.c().asks()[0]!.id, 'busy');
  await until('refused', () => /^No answer/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().badge, w.live().state, w.live().used], [NOT_TAKEN, 'Your focus · asked: no response shown', 'on', 0]);
  // The user asks, explicitly; ChatGPT refuses for the account's allowance: said in the connector's fixed words.
  await w.followUp('What is this?');
  await until('sent by the user', () => w.asks().length === 2);
  w.c().fail(w.c().asks()[1]!.id, 'allowance_exhausted', 'submitted');
  await until('refused', () => /^No answer: ChatGPT/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, 'No answer: ChatGPT says the account\'s allowance is used up. It had reached ChatGPT; it is not sent again.');
  assert.equal(w.page.ask().status!.includes('raw message'), false);
  // That ends the AI's session: nothing more is sent, and it is said why.
  const ENDED = 'ChatGPT says the account\'s allowance is used up; nothing more is sent by itself';
  assert.deepEqual([w.live().state, w.live().ended, w.live().used], ['ended', ENDED, 1]);
  await w.followUp('Again?');
  await until('not sent', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, `Not sent: the AI session has ended (${ENDED}); start it again in the control window.`);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual([w.asks().length, w.c().count('companion/start')], [2, 1], 'neither sent again nor started again by the app');
  // The user starts the AI again, and asks again; no answer comes within the bound.
  assert.deepEqual(plain(await w.press('lc:live-start', POLICY)), { ok: true });
  await w.followUp('Again?');
  await until('sent again by the user', () => w.asks().length === 3);
  await until('given up', () => /^No answer: no answer came/.test(w.page.ask().status ?? ''), 3000);
  assert.equal(w.page.ask().status, 'No answer: no answer came; whether ChatGPT worked on it is not known. It is not sent again automatically.');
  assert.deepEqual([w.live().state, w.live().ended, w.live().used], ['ended', 'no answer came; whether ChatGPT worked on it is not known; nothing more is sent by itself', 1], 'it may have reached ChatGPT: counted, and the session ends');
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual([w.asks().length, w.c().count('companion/turn'), w.c().count('companion/start')], [3, 3, 2], 'one circle and two presses, three sends; none by the app itself');
  assert.deepEqual(w.record(id).requests.map((x) => [x.outcome?.status, x.outcome?.code ?? null, x.submission, x.shown]), [['refused', 'busy', 'not_submitted', false], ['refused', 'allowance_exhausted', 'submitted', false], ['uncertain', null, 'unknown', false]]);
  assert.equal(JSON.stringify(w.records()).includes('raw message'), false);
});

test('[synthetic connector] what a page claims is checked by the main process: a stale selection, a follow-up while a request is out, an empty question, a frame that is not the display\'s, a circle outside it', async () => {
  const w = await app();
  const id = await w.select();
  const from = { sender: w.s.overlay.webContents };
  // (a follow-up's six own arguments, then the AI session it is made in)
  const submit = async (...a: unknown[]): Promise<unknown> => plain(await w.h.handlers['lc:ask-submit']!(from, ...a, ...Array.from({ length: 6 - a.length }, () => undefined), during(w)));
  assert.deepEqual(await submit('ask-0000000000000000', 'q', 'hint'), { ok: false, reason: 'this is no longer the current selection' });
  assert.deepEqual(await submit(id, 'q', 'hint'), { ok: false, reason: 'this selection\'s request is still being answered' });
  w.c().answer('A hint.');
  await until('answered', () => w.page.ask().answer === 'A hint.');
  assert.deepEqual(await submit(id, '   ', 'hint'), { ok: false, reason: 'the question is empty or too long' });
  assert.deepEqual(await submit(id, 'q'.repeat(4001), 'hint'), { ok: false, reason: 'the question is empty or too long' });
  assert.deepEqual(await submit(id, 'q', 'everything'), { ok: false, reason: 'the kind of help is not chosen' });
  assert.deepEqual(await submit(id, 'q', 'none'), { ok: false, reason: 'the kind of help is not chosen' });
  // A follow-up comes with a fresh whole frame, checked like a circle's.
  const doc = w.page.review.state().doc;
  const frame = { frame_seq: 1, frame_captured_at: '2026-09-30T12:00:00.000Z', frame_width: 1280, frame_height: 800, ink_session: doc.id, ink_revision: doc.ink.revision, visible_strokes: doc.ink.visible.length };
  const whole = Uint8Array.from(pngOf(1280, 800, 20));
  const ink = new TextEncoder().encode(JSON.stringify(doc));
  assert.deepEqual(await submit(id, 'q', 'hint'), { ok: false, reason: 'the frame facts are malformed' });
  assert.deepEqual(await submit(id, 'q', 'hint', { ...frame, frame_captured_at: 'yesterday' }, whole, ink), { ok: false, reason: 'the frame facts are malformed' });
  assert.deepEqual(await submit(id, 'q', 'hint', { ...frame, frame_width: 99999 }, whole, ink), { ok: false, reason: 'the frame is larger than the chosen display' });
  assert.deepEqual(await submit(id, 'q', 'hint', frame, new Uint8Array(8), ink), { ok: false, reason: 'the display\'s picture is not a PNG' });
  assert.deepEqual(await submit(id, 'q', 'hint', frame, Uint8Array.from(pngOf(226, 46, 20)), ink), { ok: false, reason: 'the display\'s picture is a 226×46 PNG for a 1280×800 frame' });
  // From another window: refused.
  assert.deepEqual(plain(await w.h.handlers['lc:ask-submit']!({ sender: w.control.webContents }, id, 'q', 'hint', frame, whole, ink)), { ok: false, reason: 'refused' });
  // A circle's facts and picture. (Each of these is a new selection to the main process: the one before is dropped.)
  const facts = { ...frame, region_dip: { x: 10, y: 10, width: 20, height: 10 } };
  const bad = async (f: object, png: unknown = whole): Promise<string> => (plain(await w.h.handlers['lc:ask-selection']!(from, f, png, ink)) as { reason: string }).reason;
  assert.equal(await bad({ ...facts, region_dip: { x: 2000, y: 10, width: 20, height: 10 } }), 'the selected region is not inside the display');
  assert.equal(await bad({ ...facts, region_dip: { x: 10, y: 10, width: 0, height: 10 } }), 'the selected region is not inside the display');
  assert.equal(await bad(frame), 'the selection facts are malformed');
  assert.equal(await bad({ ...facts, frame_width: 99999 }), 'the frame is larger than the chosen display');
  assert.equal(await bad({ ...facts, frame_captured_at: 'yesterday' }), 'the frame facts are malformed');
  assert.equal(await bad(facts, new Uint8Array(8)), 'the display\'s picture is not a PNG');
  assert.equal(await bad(facts, new Uint8Array(9 * 1024 * 1024)), 'the display\'s picture is over 8388608 bytes as a PNG');
  assert.deepEqual([w.asks().length, w.c().count('companion/turn'), w.records().length], [1, 1, 1], 'none of these was kept or sent');
});

test('[synthetic connector] the control window: check, sign in and model are the user\'s presses; the texts say what is so, and that ChatGPT observes a display only while its AI session runs', async () => {
  const w = await app({ check: false, configure: (c) => void (c.account = { auth: { state: 'signed_out', mode: null, plan: null }, quota: { available: false, ordinary_usage_allowed: null, windows: [] }, models: [] }) });
  const shown = (): { header: string; state: string; quota: string | null; login: boolean; cancel: boolean; model: boolean } => {
    const p = controlPage();
    p.showSubscription(w.sub());
    return { header: p.nodes['ai']!.textContent, state: p.nodes['subState']!.textContent, quota: p.nodes['subQuota']!.hidden ? null : p.nodes['subQuota']!.textContent, login: !p.nodes['subLogin']!.hidden, cancel: !p.nodes['subLoginCancel']!.hidden, model: !p.nodes['subModelRow']!.hidden };
  };
  // One control window that stays open, for what Start says and does as the state changes.
  const page = controlPage();
  const start = (): string[] => {
    page.showSubscription(w.sub());
    return [page.nodes['start']!.textContent, page.nodes['aiWhy']!.textContent];
  };
  assert.equal(shown().header, 'Captured frames and ink are kept on this device. ChatGPT (your subscription) observes a display only while its AI session runs: started by your own Start, within the bounds you set beside it, and said under Capture. Without that session nothing is sent to any AI.');
  assert.match(shown().state, /^Not checked yet\./);
  assert.deepEqual([shown().login, w.h.opened], [false, []]);
  assert.deepEqual(start(), ['Start: capture only (no AI)', 'Not available now: check the connection and sign in below. Start then captures only; nothing is sent to any AI.']);
  w.press('lc:sub-check');
  await until('read', () => w.sub().state === 'signed_out');
  assert.deepEqual([shown().state, shown().login, shown().quota, shown().model], ['Not signed in. Sign in with ChatGPT opens the official sign-in page in your browser.', true, null, false]);
  assert.deepEqual(w.h.opened, [], 'reading the state opened nothing');
  w.press('lc:sub-login');
  await until('waiting', () => w.sub().login === 'waiting');
  assert.deepEqual([w.h.opened, shown().cancel], [['https://auth.openai.com/oauth/authorize?client=synthetic'], true]);
  assert.equal(JSON.stringify(w.sub()).includes('auth.openai.com'), false);
  // The sign-in completes: the account is read again.
  w.fakes.last().account = { auth: { state: 'signed_in', mode: 'chatgpt', plan: 'Pro' }, quota: { available: true, ordinary_usage_allowed: true, windows: [bucket({ primary: { used_percent: 12, window_duration_mins: 300, resets_at: null } })] }, models: [{ id: 'a', label: 'A', image_input: true, default: false }, { id: 'b', label: 'B', image_input: true, default: true }, { id: 't', label: 'T', image_input: false, default: false }] };
  w.fakes.last().event('connection/login/completed', { login_id: 'login-1', success: true, error: null });
  await until('signed in', () => w.sub().state === 'signed_in');
  // (the account as it was when it was read, with that time: never said as how it is now)
  assert.deepEqual([w.sub().model, (shown().quota ?? '').replace(/ at [^(]+ \(/, ' at <time> ('), shown().model, shown().login], ['b', 'Usage as ChatGPT reported it at <time> (the account\'s, not this app\'s session bounds; Check connection reads it again): included usage was allowed then. codex: first window 12% used (5-hour); credits not reported.', true, false]);
  assert.equal(shown().state, 'Signed in with ChatGPT (Pro), as the official Codex app server reports. That does not show that a model will answer.');
  assert.deepEqual(start(), ['Start: capture, and let ChatGPT observe this display', ''], 'signed in with a model that takes pictures: Start says what it will do');
  // The model is the user's choice among those that take pictures.
  w.press('lc:sub-model', 't');
  assert.equal(w.sub().model, 'b', 'a model that does not take pictures cannot be chosen');
  w.press('lc:sub-model', 'a');
  assert.equal(w.sub().model, 'a');
  // From the overlay, none of these presses count.
  w.h.handlers['lc:sub-model']!({ sender: w.s.overlay.webContents }, 'b');
  assert.equal(w.sub().model, 'a');
  // Reading, signing in and choosing a model sent nothing to any AI, and started no AI session.
  assert.deepEqual([w.fakes.made.length, w.c().count('companion/start'), w.c().count('companion/turn'), w.live()], [1, 0, 0, { state: 'off', reason: null, unwritten: 0 }]);
});

test('[synthetic connector] quitting with the connector running: the app waits until it has ended, then quits once', async () => {
  const w = await app({ configure: (c) => void (c.endDelayMs = 150) }); // as the released connector: it closes its own child first
  w.h.end('stopped by the test');
  w.h.app.quit();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual([w.h.quits.n, w.fakes.last().exited], [0, false], 'held while the connector is still ending');
  await until('the app quit', () => w.h.quits.n === 1, 5000);
  assert.equal(w.fakes.last().exited, true, 'it had ended (by the end of its input) before the app quit');
});

test('[synthetic connector] signed in and ready, with no AI session started: capturing, writing, erasing, undo, redo, retained frames and selecting still send nothing but the account read, and the card says why', async () => {
  const w = await app({ ai: false });
  await w.page.review.sample();
  w.page.pointer('pointerdown', 1, 100, 200);
  for (const x of [140, 180, 220]) w.page.pointer('pointermove', 1, x, 200);
  w.page.pointer('pointerup', 1, 220, 200);
  await w.page.review.pending();
  w.page.scene.shade = 60;
  await w.page.review.sample();
  await w.page.review.retention().queue;
  w.page.click('eraser');
  w.page.pointer('pointerdown', 1, 150, 190);
  w.page.pointer('pointermove', 1, 150, 210);
  w.page.pointer('pointerup', 1, 150, 210);
  w.page.click('undo');
  w.page.click('redo');
  await w.page.review.pending();
  w.page.press('NAV');
  const id = await w.select();
  assert.match(w.page.hint() ?? '', /^Clicks go to your apps\./, 'NAV, the mode before, is back at once; the card stays');
  assert.match(w.page.hint() ?? '', /No AI observes this display \(the AI was not started with this capture\)\./);
  assert.equal(w.page.ask().status, `Kept on this device. The AI was not asked: ${NOT_STARTED}.`);
  await w.followUp('What is this?');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, `Not sent: ${NOT_STARTED}.`);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(w.fakes.made.length === 1 && w.fakes.last().calls.map((c) => c.method), ['connection/read'], 'only the user\'s own Check reached the connector');
  assert.deepEqual([w.record(id).requests, w.live(), w.lines()], [[], { state: 'off', reason: null, unwritten: 0 }, []]);
  assert.equal(fs.readFileSync(path.join(w.folder(), 'manifest.jsonl'), 'utf8').includes('ask'), false, 'nothing of ASK is in the capture manifest');
});

test('[synthetic connector] the ink of a selection is the document as it was when selected, even if it changes while the picture is encoded', async () => {
  const w = await app();
  w.page.pointer('pointerdown', 1, 200, 105);
  for (const x of [240, 280]) w.page.pointer('pointermove', 1, x, 105);
  w.page.pointer('pointerup', 1, 280, 105);
  await w.page.review.pending();
  const revision = w.page.review.state().doc.ink.revision;
  let release!: () => void;
  w.page.encoding.gate = new Promise<void>((r) => (release = r)); // the picture's encoding is held
  w.circle();
  await settle();
  w.page.click('undo'); // the document changes while the picture is still being encoded
  assert.notEqual(w.page.review.state().doc.ink.revision, revision);
  w.page.encoding.gate = null;
  release();
  await until('the card', () => w.page.ask().form);
  const [r] = w.records();
  assert.deepEqual([r!.context.ink_revision, typeof r!.ink_original.sha256], [revision, 'string'], 'bound to the document drawn into the picture, and retained');
  const doc = JSON.parse(fs.readFileSync(path.join(w.folder(), r!.ink_original.file!), 'utf8'));
  assert.deepEqual([doc.ink.revision, doc.ink.visible.length], [revision, 1]);
  // And that is the ink the circle's own request names.
  await until('sent', () => w.asks().length === 1);
  assert.deepEqual([w.asks()[0]!.context.ink_revision, w.asks()[0]!.context.ink_sha256], [revision, r!.ink_original.sha256]);
});

test('[synthetic connector] the frame is replaced and its bitmap closed while the selection\'s picture is encoded: the selection is kept, with the same pixels, frame facts and ink, and that picture is what is sent', async () => {
  const w = await app();
  w.page.pointer('pointerdown', 1, 200, 105);
  for (const x of [240, 280]) w.page.pointer('pointermove', 1, x, 105);
  w.page.pointer('pointerup', 1, 280, 105);
  await w.page.review.pending();
  // The frame the selections are made from: a bitmap this test holds, so it can see when the app closes it.
  const bitmap = { width: 1280, height: 800, shade: 20, close() { this.width = this.height = 0; } };
  w.page.review.frame({ bitmap, seq: 41, at: '2026-09-30T12:00:05.000Z', presented: 41, presentedAt: performance.now() });
  /** The frame a record is of, apart from the AI session's own count of frames (each selection is one more). */
  const frameOf = (r: Rec): unknown => [r.sample_seq, { ...r.context, frame_seq: 0 }, { ...r.focus, frame_seq: 0 }];
  // Control: nothing happens while the picture is encoded.
  const control = w.record(await w.select());
  assert.deepEqual([control.sample_seq, control.context.frame_captured_at, control.context.frame_width, control.context.frame_height], [41, '2026-09-30T12:00:05.000Z', 1280, 800]);
  // The same gesture; while its picture is encoded the screen changes, and the sampler takes the next frame and
  // closes this one (a closed bitmap's size reads as 0).
  let release!: () => void;
  w.page.encoding.gate = new Promise<void>((r) => (release = r));
  w.circle();
  await settle();
  w.page.scene.shade = 90;
  void w.page.review.sample();
  await until('the app\'s own sampler closed the frame', () => bitmap.width === 0 && bitmap.height === 0);
  w.page.encoding.gate = null;
  release();
  await until('the second selection is kept', () => w.records().length === 2 && w.page.ask().form);
  const held = w.records().find((r) => r.selection_id !== control.selection_id)!;
  await until('asked', () => HINT_ASKED.test(w.page.ask().status ?? ''));
  assert.deepEqual(frameOf(held), frameOf(control), 'the frame it was made from: its number, time and size, the circle in its pixels, and the ink');
  assert.deepEqual([held.image.sha256, held.ink_original.sha256], [control.image.sha256, control.ink_original.sha256], 'the same pixels and the same ink document, although the screen shows something else now');
  assert.match(w.page.review.card()!.text, / px of frame 41 \(captured /);
  // It was asked about at once, and what was sent is that picture.
  await until('sent', () => w.asks().length === 2);
  const sent = w.asks()[1]!;
  assert.deepEqual([sent.request_id, sent.image.sha256, sent.context, sent.focus], [`${held.selection_id}.1`, control.image.sha256, held.context, held.focus]);
  assert.deepEqual([sent.context.frame_captured_at, sent.context.frame_width, sent.context.frame_height, sent.focus?.region_px], ['2026-09-30T12:00:05.000Z', 1280, 800, CIRCLE]);
  w.c().answer('ok');
  await until('answered', () => w.page.ask().answer !== null);
  // A selection after that is made from the new frame: another number, other pixels.
  await w.page.review.pending();
  const later = w.record(await w.select(600, 120));
  assert.notEqual(later.sample_seq, 41);
  assert.notEqual(later.image.sha256, control.image.sha256);
  assert.deepEqual([later.context.frame_width, later.context.frame_height, w.asks().at(-1)!.image.sha256], [1280, 800, later.image.sha256]);
});

test('[synthetic connector] a follow-up holding half of a surrogate pair is not sent and not recorded as asked; the connector and the AI\'s session are untouched; valid text of any script is sent as typed', async () => {
  const w = await app();
  const id = await w.select();
  w.c().answer('A hint.');
  await until('answered', () => w.page.ask().answer === 'A hint.');
  const calls = w.c().calls.length;
  await w.followUp('What is \ud83d this?');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, `Not sent: the question holds a damaged character (half of a pair), so it cannot be sent as it is; type that part again.${STILL}`);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([w.asks().length, w.c().calls.length, w.record(id).requests.length, w.sub().state, w.live().state, w.fakes.made.length, w.fakes.last().exited], [1, calls, 1, 'signed_in', 'on', 1, false]);
  assert.equal(w.page.ask().answer, 'A hint.', 'the response before is still shown');
  // The same card can still ask, in any valid text.
  const question = '这个 😀 是什么? é \u{1F9EE}';
  await w.followUp(`  ${question}  `);
  await until('sent', () => w.asks().length === 2);
  assert.equal(w.asks()[1]!.user_text, question);
  assert.equal(w.record(id).requests[1]!.question, question);
  w.c().answer('ok');
  await until('answered', () => w.page.ask().answer === 'ok');
});

test('[synthetic connector] an answer whose overlay is lost before it reports what it did is recorded as presentation unconfirmed: its text is kept, and it is not counted as shown', async () => {
  const w = await app();
  const entry = (): Entry => w.records()[0]!.requests.at(-1)!;
  await w.select();
  // An answer the overlay reports as shown (the circle's own hint).
  assert.deepEqual([entry().shown, 'presentation' in entry()], [false, false], 'nothing to present yet');
  w.c().answer('Seen on the card.');
  await until('shown and reported', () => entry().shown === true);
  assert.deepEqual([entry().presentation, w.page.ask().answer], ['shown', 'Seen on the card.']);
  // A refusal has nothing to present.
  await w.followUp('And this?');
  await until('sent', () => w.asks().length === 2);
  w.c().fail(w.c().asks()[1]!.id, 'busy');
  await until('refused', () => /^No answer/.test(w.page.ask().status ?? ''));
  assert.deepEqual([entry().shown, 'presentation' in entry()], [false, false]);
  // An answer is on its way to the overlay (the overlay has not reported anything) when the overlay is lost.
  const release = w.page.holdSubmitAck();
  await w.followUp('And that?');
  await until('sent', () => w.asks().length === 3);
  w.c().answer('TEXT WHOSE PRESENTATION NOBODY REPORTED');
  await until('recorded', () => entry().outcome !== null);
  assert.deepEqual([entry().shown, entry().presentation], [false, 'unconfirmed'], 'from the moment it is sent to the overlay');
  w.s.overlay.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  await until('the session ended', () => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended != null, 5000);
  release();
  await settle();
  const last = entry();
  assert.deepEqual([last.outcome?.status, last.outcome?.answer?.text, last.shown, last.presentation], ['answered', 'TEXT WHOSE PRESENTATION NOBODY REPORTED', false, 'unconfirmed'], 'no report is not proof it was not seen: kept, and not counted as shown');
  // The earlier entries are as they were.
  assert.deepEqual(w.records()[0]!.requests.map((x) => [x.outcome?.status, x.shown, x.presentation ?? null]), [['answered', true, 'shown'], ['refused', false, null], ['answered', false, 'unconfirmed']]);
});

test('[synthetic connector] the main process works the circle\'s pixels out itself, from the frame\'s actual size: a region off whole pixels is floored and ceiled, and a picture that is not the whole frame is refused', async () => {
  const w = await app();
  const from = { sender: w.s.overlay.webContents };
  const session = (w.s as unknown as { doc: { id: string } }).doc.id;
  const facts = { region_dip: { x: 10.4, y: 10.6, width: 20.2, height: 10.1 }, frame_seq: 1, frame_captured_at: '2026-09-30T12:00:00.000Z', frame_width: 1280, frame_height: 800, ink_session: session, ink_revision: 0, visible_strokes: 0 };
  const ink = new TextEncoder().encode(JSON.stringify(w.page.review.state().doc));
  const send = async (width: number, height: number, f: object = facts) => plain(await w.h.handlers['lc:ask-selection']!(from, f, Uint8Array.from(pngOf(width, height, 20)), ink, during(w))) as { ok: boolean; reason?: string; selection_id?: string };
  // The circle's own pixels are not the picture: what is kept and sent is the whole frame.
  assert.deepEqual(await send(21, 11), { ok: false, reason: 'the display\'s picture is a 21×11 PNG for a 1280×800 frame' });
  const whole = await send(1280, 800);
  assert.equal(whole.ok, true);
  assert.deepEqual(w.record(whole.selection_id!).focus.region_px, { x: 10, y: 10, width: 21, height: 11 }, 'floor of the left and top, ceiling of the right and bottom');
  assert.deepEqual([w.record(whole.selection_id!).focus.region_dip, w.record(whole.selection_id!).context.region_px, w.record(whole.selection_id!).context.region_dip], [facts.region_dip, WHOLE, WHOLE]);
  // A frame at half the display's size: by the frame's actual pixels over the display's, never by a nominal scale.
  const half = await send(640, 400, { ...facts, frame_width: 640, frame_height: 400 });
  assert.equal(half.ok, true);
  const r = w.record(half.selection_id!);
  assert.deepEqual([r.focus.region_px, r.focus.region_dip, r.context.region_px, r.context.region_dip, r.image.width, r.image.height], [{ x: 5, y: 5, width: 11, height: 6 }, facts.region_dip, { x: 0, y: 0, width: 640, height: 400 }, WHOLE, 640, 400]);
  // What went to the connector says the same, for each.
  await until('sent', () => w.asks().length === 2);
  assert.deepEqual(w.asks().map((t) => [t.focus, t.context.region_px, t.image.width]), [[w.record(whole.selection_id!).focus, WHOLE, 1280], [r.focus, { x: 0, y: 0, width: 640, height: 400 }, 640]]);
});

test('[synthetic connector] what cannot be written is not asked: a selection that could not be kept, and a follow-up whose record could not be written', async () => {
  const w = await app();
  w.h.failWrites.on = true;
  assert.equal(await w.select(), null);
  assert.match(w.page.ask().status ?? '', /^This selection could not be kept, so nothing was asked: the selection could not be written to this device \(.*\)\. It was not sent to any AI\.$/);
  assert.deepEqual([w.page.ask().form, w.asks().length], [false, 0]);
  w.h.failWrites.on = false;
  const id = await w.select(600, 120);
  w.c().answer('A hint.');
  await until('shown, and recorded as shown', () => w.record(id).requests[0]!.shown);
  w.h.failWrites.on = true;
  await w.followUp('What is this?');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.match(w.page.ask().status ?? '', /^Not sent: the request could not be written to this device \(.*\), so it was not sent\. The response still shown is the one before: From ChatGPT /);
  assert.equal(w.page.ask().answer, 'A hint.', 'the response before stays on the card');
  // Nothing was asked, so nothing of a question is left unwritten: the session's end does not say there is.
  w.page.click('close');
  w.h.end('stopped by the test');
  const ended = (): string | null => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended ?? null;
  await until('ended', () => ended() !== null, 5000);
  assert.equal(ended(), 'stopped by the test');
  w.h.failWrites.on = false;
  assert.equal(w.asks().length, 1, 'nothing was sent but the kept circle\'s own request');
  assert.deepEqual(w.record(id).requests.map((x) => [x.trigger, x.outcome?.status]), [['focus', 'answered']], 'and no follow-up is recorded as made');
});

test('[synthetic connector] closing the card, or a selection that selects nothing, interrupts the request that is out, also before the overlay has the selection\'s acknowledgement; its late response is neither shown nor kept', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const one = await w.select();
  w.page.click('close');
  await until('interrupted', () => w.c().count('companion/interrupt') === 1);
  w.c().answer('A late answer after the card was closed.');
  await until('ended', () => w.sub().asking === false);
  assert.deepEqual([w.page.review.card(), JSON.stringify(w.records()).includes('late answer')], [null, false]);
  assert.deepEqual(plain(await w.h.handlers['lc:ask-submit']!({ sender: w.s.overlay.webContents }, one, 'again?', 'hint')), { ok: false, reason: 'this is no longer the current selection' });
  // A new selection that selects nothing replaces the card too.
  await w.select(600, 120);
  assert.equal(w.asks().length, 2);
  w.page.press('ASK'); // a circle outside the captured display selects nothing
  w.page.pointer('pointerdown', 2, 5000, 5000);
  w.page.pointer('pointermove', 2, 5100, 5100);
  w.page.pointer('pointerup', 2, 5000, 5001);
  await until('the empty card', () => /nothing was selected/.test(w.page.review.card()?.text ?? ''));
  await until('the request before is interrupted', () => w.c().count('companion/interrupt') === 2);
  w.c().answer('A late answer after a new, empty selection.');
  await until('ended', () => w.sub().asking === false);
  assert.deepEqual([w.page.ask().form, w.page.ask().answer, JSON.stringify(w.records()).includes('empty selection'), w.asks().length], [false, null, false, 2]);
  // Closed while the selection's own acknowledgement is still on its way to the overlay: the main process already
  // sent the circle's request, and interrupts it for the card that is gone.
  const release = w.page.holdSubmitAck();
  w.circle();
  await until('sent', () => w.asks().length === 3);
  assert.equal(w.page.ask().status, 'Keeping this on this device…', 'not acknowledged yet');
  w.page.click('close');
  await until('interrupted', () => w.c().count('companion/interrupt') === 3);
  release();
  w.c().answer('A late answer for a card closed before it knew its selection.');
  await until('ended', () => w.sub().asking === false);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([w.page.review.card(), w.page.ask().answer, JSON.stringify(w.records()).includes('before it knew')], [null, null, false]);
  assert.deepEqual(w.records().map((r) => r.requests.map((x) => [x.outcome, x.shown])), [[[{ status: 'cancelled', uncertain: true }, false]], [[{ status: 'cancelled', uncertain: true }, false]], [[{ status: 'cancelled', uncertain: true }, false]]]);
  assert.deepEqual([w.live().state, w.c().count('companion/stop')], ['on', 0], 'the AI\'s session goes on');
});

test('[synthetic connector] the help chosen is per selection, and Cancel pressed as the response arrives still shows no answer', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const id = await w.select();
  w.c().answer('A hint.');
  await until('answered', () => w.page.ask().answer === 'A hint.');
  await w.followUp('Solve it.', 'full_solution');
  await until('sent', () => w.asks().length === 2);
  assert.equal(w.asks()[1]!.allowed_assistance, 'full_solution');
  await until('acknowledged', () => /^Asked at/.test(w.page.ask().status ?? ''));
  // Cancel is pressed while a response is already on its way from the main process to the overlay.
  const request = w.asks()[1]!.request_id;
  w.page.click('askCancel');
  w.s.overlay.webContents.send('lc:ask-result', id, request, { status: 'answered', answer: { request_id: request, text: 'An answer that crosses the Cancel.', model: 'vision-model', latency_ms: 5 } }, { saved: true, reason: null, speak: false });
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([w.page.ask().answer, w.page.ask().status], [null, UNCONFIRMED], 'said it would not be shown, and it is not');
  w.c().fail(w.c().asks()[1]!.id, 'cancelled', 'submitted');
  await until('ended', () => w.sub().asking === false);
  // The next selection starts at "a hint" again, for its follow-up too.
  await w.select(600, 120);
  w.c().answer('Another hint.');
  await until('answered', () => w.page.ask().answer === 'Another hint.');
  await w.followUp('And this one?');
  await until('sent', () => w.asks().length === 4);
  assert.deepEqual(w.asks().map((t) => [t.trigger, t.allowed_assistance]), [['focus', 'hint'], ['text_followup', 'full_solution'], ['focus', 'hint'], ['text_followup', 'hint']]);
});

test('[synthetic connector] how a request ended, said before the overlay has its acknowledgement, is still shown: a refusal of the circle\'s own request, and a follow-up\'s answer; a result for another request is not', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const entries = (): Entry[] => w.records().at(-1)!.requests;
  // An immediate refusal of the circle's own request (the connector says ChatGPT is not signed in at once), while
  // the selection's acknowledgement is still on its way to the overlay.
  let release = w.page.holdSubmitAck();
  w.circle();
  await until('sent', () => w.asks().length === 1);
  w.c().fail(w.c().asks()[0]!.id, 'unauthenticated');
  await until('recorded by the main process', () => entries()[0]!.outcome !== null);
  await settle();
  assert.equal(w.page.ask().status, 'Keeping this on this device…', 'not acknowledged yet');
  release();
  await until('shown', () => /^No answer/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().badge, w.page.ask().submit, w.page.ask().cancel], ['No answer: ChatGPT is not signed in. It did not reach ChatGPT; it is not sent again.', 'Your focus · asked: no response shown', true, false]);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(/Waiting for the response/.test(w.page.ask().status ?? ''), false, 'never left waiting');
  assert.deepEqual([w.sub().state, w.live().state, w.live().ended], ['signed_out', 'ended', 'ChatGPT is not signed in; nothing more is sent by itself'], 'as the connector said; and the AI\'s session ended with it');
  // The user checks again (the stand-in's account is signed in), and starts the AI again.
  w.press('lc:sub-check');
  await until('signed in', () => w.sub().state === 'signed_in');
  assert.deepEqual(plain(await w.press('lc:live-start', POLICY)), { ok: true });
  // A follow-up's answer, with a result for another request of this selection in between: only this request's is shown.
  release = w.page.holdSubmitAck();
  await w.followUp('What is this?');
  await until('sent', () => w.asks().length === 2);
  const selection = w.records()[0]!.selection_id;
  w.s.overlay.webContents.send('lc:ask-result', selection, `${selection}.7`, { status: 'answered', answer: { request_id: `${selection}.7`, text: 'For a request this card never made.', model: 'vision-model', latency_ms: 5 } }, { saved: true, reason: null, speak: false });
  await settle();
  assert.equal(w.page.ask().status, SENDING, 'not acknowledged yet');
  release();
  await until('acknowledged', () => /Waiting for the response…$/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().answer, w.page.ask().cancel, w.page.ask().badge], [null, true, 'Your focus · asked: being sent to ChatGPT'], 'the other request\'s answer is not accepted');
  assert.equal(w.asks()[1]!.request_id, `${selection}.2`);
  w.c().answer('The answer to the question that was asked.');
  await until('answered', () => w.page.ask().answer !== null);
  assert.equal(w.page.ask().answer, 'The answer to the question that was asked.');
  assert.equal(w.page.ask().status, ANSWERED, '(the circle never went out in the new AI session and the picture is unchanged: it is worked out anew, and is this request\'s focus)');
  await until('recorded as shown', () => entries()[1]!.shown);
  assert.deepEqual(entries().map((x) => [x.outcome?.status, x.shown]), [['refused', false], ['answered', true]]);
});

test('[synthetic connector] an answer said before the acknowledgement is shown once acknowledged and only then recorded as shown; a Cancel pressed before it shows none', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const entries = (): Entry[] => w.records().at(-1)!.requests;
  // The circle's own request, answered before the overlay has the selection's acknowledgement.
  let release = w.page.holdSubmitAck();
  w.circle();
  await until('sent', () => w.asks().length === 1);
  w.c().answer('Answered before the acknowledgement.');
  await until('recorded', () => entries()[0]!.outcome !== null);
  await settle();
  assert.deepEqual([w.page.ask().answer, w.page.ask().status, entries()[0]!.shown], [null, 'Keeping this on this device…', false]);
  release();
  await until('shown', () => w.page.ask().answer !== null);
  await until('recorded as shown', () => entries()[0]!.shown === true);
  assert.deepEqual([w.page.ask().answer, w.page.ask().status, w.page.ask().badge, w.page.ask().save], ['Answered before the acknowledgement.', ANSWERED, 'Your focus · ChatGPT\'s response is below', false]);
  // Cancel pressed while a follow-up's submit is still unacknowledged; the cancelled outcome arrives before the
  // acknowledgement (the connector ended it as cancelled, and confirmed the interruption).
  release = w.page.holdSubmitAck();
  await w.followUp('What is this?');
  await until('sent', () => w.asks().length === 2);
  w.page.click('askCancel');
  await until('the interrupt is told', () => w.c().count('companion/interrupt') === 1);
  w.c().fail(w.c().asks()[1]!.id, 'cancelled', 'submitted');
  await until('recorded', () => entries()[1]!.outcome !== null);
  await settle();
  release();
  await until('said', () => /^Cancelled: no answer is shown\./.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().answer, w.page.ask().submit, w.page.ask().cancel, w.page.ask().badge], [CANCELLED, null, true, false, 'Your focus · asked: no response shown']);
  assert.deepEqual(entries()[1]!.outcome, { status: 'cancelled', uncertain: false });
  // An answer that had already left the main process when Cancel was pressed before the acknowledgement: not shown,
  // and the record says it was not (its text is not kept).
  release = w.page.holdSubmitAck();
  await w.followUp('And this?');
  await until('sent', () => w.asks().length === 3);
  w.c().answer('An answer the user cancelled before seeing.');
  await until('recorded', () => entries()[2]!.outcome !== null);
  await settle();
  w.page.click('askCancel');
  release();
  await until('said', () => /^Cancelled: no answer is shown\./.test(w.page.ask().status ?? ''));
  await until('the record follows', () => entries()[2]!.outcome?.status === 'cancelled');
  assert.deepEqual([w.page.ask().answer, entries()[2]!.shown, entries()[2]!.outcome, JSON.stringify(w.records()).includes('cancelled before seeing')], [null, false, { status: 'cancelled', uncertain: true }, false]);
  assert.equal('presentation' in entries()[2]!, false, 'the overlay itself said it did not show it');
  assert.equal(w.asks().length, 3, 'one circle and two presses, three sends');
  // The card is closed while an answer is still held back from it: it was never shown, and its text is not kept.
  release = w.page.holdSubmitAck();
  await w.followUp('And that?');
  await until('sent', () => w.asks().length === 4);
  w.c().answer('An answer for a card that closed first.');
  await until('recorded', () => entries()[3]!.outcome !== null);
  await settle();
  w.page.click('close');
  release();
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([w.page.review.card(), entries()[3]!.shown, entries()[3]!.outcome, JSON.stringify(w.records()).includes('closed first')], [null, false, { status: 'cancelled', uncertain: true }, false]);
  assert.equal('presentation' in entries()[3]!, false, 'its card closed before the answer reached it (the overlay\'s messages come in order)');
});

test('[synthetic connector] an answer whose record cannot be written is said as NOT saved, kept in the app, and written by Save; it is recorded as shown only once the overlay showed it', async () => {
  const w = await app();
  const NOT_SAVED = 'This is NOT saved on this device yet: it could not be written (Error: EIO: i/o error (injected)). It is kept in the app and tried again when this card closes; press Save to try now.';
  await w.select();
  const png = fs.readFileSync(path.join(w.folder(), w.records()[0]!.image.file));
  w.h.failWrites.on = true;
  w.c().answer('SYNTHETIC assistance that must not vanish.');
  await until('shown', () => w.page.ask().answer !== null);
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, `${ANSWERED} ${NOT_SAVED}`);
  assert.deepEqual([w.page.ask().answer, w.page.ask().save], ['SYNTHETIC assistance that must not vanish.', true]);
  assert.equal(w.records()[0]!.requests[0]!.outcome, null, 'the device has the request, not yet how it ended');
  // Save while it still cannot be written: still said; nothing is asked again.
  w.page.click('askSave');
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([w.page.ask().save, /NOT saved/.test(w.page.ask().status ?? '')], [true, true]);
  w.h.failWrites.on = false;
  w.page.click('askSave');
  await until('saved', () => !w.page.ask().save);
  assert.equal(w.page.ask().status, ANSWERED);
  const entry = w.records()[0]!.requests[0]!;
  assert.deepEqual([entry.outcome?.status, entry.outcome?.answer?.text, entry.shown], ['answered', 'SYNTHETIC assistance that must not vanish.', true]);
  assert.deepEqual([w.asks().length, fs.readFileSync(path.join(w.folder(), w.records()[0]!.image.file)).equals(png)], [1, true], 'asked once; the original picture is untouched');
  // A refusal whose record cannot be written is said the same way.
  await w.followUp('What is this?');
  await until('sent', () => w.asks().length === 2);
  w.h.failWrites.on = true;
  w.c().fail(w.c().asks()[1]!.id, 'busy');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, `${NOT_TAKEN} ${NOT_SAVED}`);
  w.h.failWrites.on = false;
  w.page.click('askSave');
  await until('saved', () => !w.page.ask().save);
  assert.equal(w.page.ask().status, NOT_TAKEN, 'the status of this outcome, not of the one before');
  assert.deepEqual(w.records()[0]!.requests.map((x) => x.outcome?.status), ['answered', 'refused']);
  // A refusal that is NOT saved, then the capture ends: the card goes on saying so, with Save.
  await w.followUp('And this?');
  await until('sent', () => w.asks().length === 3);
  w.h.failWrites.on = true;
  w.c().fail(w.c().asks()[2]!.id, 'allowance_exhausted', 'submitted');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  w.page.review.endCapture('the capture ended in this test');
  assert.deepEqual([/^No answer: ChatGPT says the account's allowance is used up\. (It had reached ChatGPT|It did not reach ChatGPT); it is not sent again\. This is NOT saved on this device yet: /.test(w.page.ask().status ?? ''), w.page.ask().save, w.page.ask().form], [true, true, false]);
  w.h.failWrites.on = false;
});

test('[synthetic connector] while an outcome is NOT saved, a follow-up that is refused leaves the card saying so with Save and the answer; a late Save answer never replaces a newer request\'s status', async () => {
  const w = await app();
  const NOT_SAVED = 'NOT saved on this device yet: it could not be written (Error: EIO: i/o error (injected)). It is kept in the app and tried again when this card closes; press Save to try now.';
  const UNWRITTEN = `Not sent: the request could not be written to this device (Error: EIO: i/o error (injected)), so it was not sent.${STILL}`;
  await w.select();
  w.h.failWrites.on = true;
  w.c().answer('An answer the device has not written.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  // A follow-up while it still cannot be written: refused, and the card still says what is not saved.
  await w.followUp('And then?');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, `${UNWRITTEN} How the request before ended is ${NOT_SAVED}`);
  assert.deepEqual([w.page.ask().save, w.page.ask().answer, w.page.ask().submit], [true, 'An answer the device has not written.', true]);
  w.page.click('askSave'); // still cannot be written: said again, about the request before
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(w.page.ask().status, `${UNWRITTEN} How the request before ended is ${NOT_SAVED}`);
  assert.deepEqual([w.page.ask().save, w.page.ask().answer], [true, 'An answer the device has not written.']);
  // Refused for another reason, the device writable again: the same; nothing is written until Save (or the card's end).
  w.h.failWrites.on = false;
  await w.followUp('   ');
  await until('refused', () => /^Not sent: the question is empty/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, `Not sent: the question is empty or too long.${STILL} How the request before ended is ${NOT_SAVED}`);
  assert.deepEqual([w.page.ask().save, w.page.ask().answer, w.records()[0]!.requests[0]!.outcome], [true, 'An answer the device has not written.', null]);
  // Save, and at once a follow-up (its acknowledgement held back): the Save's answer does not replace "Sending…".
  w.page.question('And now?');
  const release = w.page.holdSubmitAck();
  w.page.click('askSave');
  w.page.click('askSubmit');
  await until('sent', () => w.asks().length === 2);
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([w.page.ask().status, w.page.ask().save], [SENDING, false]);
  release();
  await until('acknowledged', () => /^Asked at/.test(w.page.ask().status ?? ''));
  assert.deepEqual(w.records()[0]!.requests.map((x) => [x.outcome?.status ?? null, x.shown]), [['answered', true], [null, false]]);
  // That request is not taken; nothing is unsaved now, so nothing says so.
  w.c().fail(w.c().asks()[1]!.id, 'busy');
  await until('refused', () => /^No answer/.test(w.page.ask().status ?? ''));
  await w.followUp('');
  await until('refused', () => /^Not sent/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().save], ['Not sent: the question is empty or too long.', false]);
  assert.equal(w.asks().length, 2, 'one circle and one accepted press, two sends');
});

test('[synthetic connector] a follow-up refused while the outcome before is unwritten leaves it held as unwritten: Save then writes it; a Save answered while a follow-up is out is still taken', async () => {
  const w = await app();
  await w.select();
  w.h.failWrites.on = true;
  w.c().answer('An answer the device has not written.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  await w.followUp('And then?');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  w.h.failWrites.on = false;
  w.page.click('askSave');
  await until('saved', () => !w.page.ask().save);
  const entry = w.records()[0]!.requests[0]!;
  assert.deepEqual([entry.outcome?.status ?? null, entry.shown, w.records()[0]!.requests.length, w.asks().length], ['answered', true, 1, 1], 'really written, and nothing asked again');
  assert.equal(w.page.ask().status, `Not sent: the request could not be written to this device (Error: EIO: i/o error (injected)), so it was not sent.${STILL}`);
  // Unwritten again; Save (it is written now) and at once a follow-up that is refused: the Save's answer was taken,
  // so nothing is said to be unsaved.
  await w.followUp('And then?');
  await until('sent', () => w.asks().length === 2);
  w.h.failWrites.on = true;
  w.c().answer('A second answer.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  w.h.failWrites.on = false;
  w.page.question('   ');
  const release = w.page.holdSubmitAck();
  w.page.click('askSave');
  w.page.click('askSubmit');
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(w.page.ask().status, SENDING);
  release();
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().save, w.page.ask().answer], [`Not sent: the question is empty or too long.${STILL}`, false, 'A second answer.']);
  assert.deepEqual(w.records()[0]!.requests.map((x) => [x.outcome?.status, x.shown]), [['answered', true], ['answered', true]]);
});

test('[synthetic connector] what the overlay says it did with an answer is taken only from the overlay, for the current selection and that request, and once', async () => {
  const w = await app();
  const overlay = { sender: w.s.overlay.webContents };
  // The circle's own request is answered while the selection's acknowledgement is held back from the overlay.
  const release = w.page.holdSubmitAck();
  w.circle();
  await until('sent', () => w.asks().length === 1);
  const id = w.records()[0]!.selection_id;
  const request = `${id}.1`;
  w.c().answer('An answer not yet shown.');
  await until('recorded', () => w.records()[0]!.requests[0]!.outcome !== null);
  await settle();
  const before = JSON.stringify(w.records());
  assert.equal(w.records()[0]!.requests[0]!.shown, false);
  for (const from of [{ sender: w.control.webContents }, { sender: {} }]) {
    assert.deepEqual(plain(await w.h.handlers['lc:ask-presented']!(from, id, request, true)), { saved: false, reason: 'refused' });
    assert.deepEqual(plain(await w.h.handlers['lc:ask-presented']!(from, id, request, false)), { saved: false, reason: 'refused' });
    assert.deepEqual(plain(await w.h.handlers['lc:ask-save']!(from, id)), { saved: false, reason: 'refused' });
  }
  // From the overlay, but for another selection or another request: nothing changes.
  await w.h.handlers['lc:ask-presented']!(overlay, 'ask-0000000000000000', request, true);
  await w.h.handlers['lc:ask-presented']!(overlay, id, `${id}.9`, true);
  await w.h.handlers['lc:ask-presented']!(overlay, id, `${id}.9`, false);
  assert.equal(JSON.stringify(w.records()), before);
  assert.deepEqual(plain(await w.h.handlers['lc:ask-save']!(overlay, 'ask-0000000000000000')), { saved: false, reason: 'this is no longer the current selection' });
  // Shown, then said as not shown: what was recorded as shown stays, with its text.
  release();
  await until('shown', () => w.records()[0]!.requests[0]!.shown === true);
  assert.deepEqual(plain(await w.h.handlers['lc:ask-presented']!(overlay, id, request, false)), { saved: true, reason: null });
  const entry = w.records()[0]!.requests[0]!;
  assert.deepEqual([entry.outcome?.answer?.text, entry.shown, entry.presentation], ['An answer not yet shown.', true, 'shown']);
});

test('[synthetic connector] an outcome still unwritten when its card goes is written when it can be: at the card\'s end, at the session\'s end (said there if not), and at the next Start', async () => {
  const w = await app();
  const said = (): string | null => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended ?? null;
  await w.select();
  const folder = w.folder();
  const entry = (): Entry => (JSON.parse(fs.readFileSync(path.join(folder, 'asks', fs.readdirSync(path.join(folder, 'asks')).find((f) => f.endsWith('.json'))!), 'utf8')) as Rec).requests[0]!;
  w.h.failWrites.on = true;
  w.c().answer('Shown, and written late.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  // The card is closed while it still cannot be written, then the session is stopped while it still cannot.
  w.page.click('close');
  await settle();
  assert.equal(entry().outcome, null);
  w.h.end('stopped by the test');
  await until('ended', () => said() !== null, 5000);
  assert.match(said()!, /^stopped by the test\. How 1 question\(s\) to ChatGPT ended \(an answer included, if one was shown or may have been\) could not be written to this device \(Error: EIO: i\/o error \(injected\)\); the selections and their pictures are kept, without that outcome, and writing it is tried again at the next Start and when the app closes$/);
  assert.equal(entry().outcome, null);
  // The device can be written again: the next Start writes it, exactly as it was held.
  w.h.failWrites.on = false;
  await running(w.h);
  assert.deepEqual([entry().outcome?.status, entry().outcome?.answer?.text, entry().shown], ['answered', 'Shown, and written late.', true]);
  assert.equal(w.fakes.made.reduce((n, c) => n + c.turns().length, 0), 1, 'never asked again to repair the record');
});

test('[synthetic connector] an unwritten outcome is written at its card\'s end, or at the session\'s end, when the device can be written then: nothing is said, and nothing is asked again', async () => {
  for (const at of ['card', 'session'] as const) {
    const w = await app();
    const ended = (): string | null => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended ?? null;
    await w.select();
    w.h.failWrites.on = true;
    w.c().answer(`Written at the ${at}'s end.`);
    await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
    if (at === 'card') w.h.failWrites.on = false;
    w.page.click('close');
    await settle();
    const entry = (): Entry => w.records()[0]!.requests[0]!;
    if (at === 'card') {
      assert.deepEqual([entry().outcome?.answer?.text, entry().shown], ['Written at the card\'s end.', true]);
    } else {
      assert.equal(entry().outcome, null);
      w.h.failWrites.on = false;
    }
    w.h.end('stopped by the test');
    await until('ended', () => ended() !== null, 5000);
    assert.equal(ended(), 'stopped by the test', 'nothing is left unwritten, so nothing says so');
    assert.deepEqual([entry().outcome?.answer?.text, entry().shown, w.c().turns().length], [`Written at the ${at}'s end.`, true, 1]);
  }
});

test('[synthetic connector] an outcome that comes after its session ended and cannot be written is said where the session\'s end is said, counted with what is already held, and written at the next Start', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const ended = (): string | null => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended ?? null;
  const told = (): string | null => (plain(w.control.sent.filter((m) => m[0] === 'lc:session').at(-1)?.[1]) as { ended?: string | null } | undefined)?.ended ?? null;
  // A first selection whose answer is shown but cannot be written; a second selection then replaces its card, and
  // its own request goes out.
  const first = (await w.select())!;
  w.h.failWrites.only = `${first}.json`;
  w.c().answer('Shown on the first card.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  const second = (await w.select(600, 120))!;
  const dir = w.folder();
  const all = w.records();
  const entryOf = (id: string): Entry => (JSON.parse(fs.readFileSync(path.join(dir, 'asks', `${id}.json`), 'utf8')) as Rec).requests[0]!;
  assert.equal(w.asks().length, 2);
  w.h.end('stopped by the test');
  await until('ended', () => ended() !== null, 5000);
  assert.match(ended()!, /^stopped by the test\. How 1 question\(s\) to ChatGPT ended /, 'the first, held since its card was replaced');
  assert.equal(w.sub().asking, true, 'the second request is still out');
  // The second request ends after the session, and cannot be written either.
  w.h.failWrites.only = null;
  w.h.failWrites.on = true;
  w.c().answer('An answer after the Stop.');
  await until('the request ended', () => w.sub().asking === false);
  assert.deepEqual([entryOf(first).outcome, entryOf(second).outcome], [null, null]);
  assert.equal(ended(), 'stopped by the test. How 2 question(s) to ChatGPT ended (an answer included, if one was shown or may have been) could not be written to this device (Error: EIO: i/o error (injected)); the selections and their pictures are kept, without that outcome, and writing it is tried again at the next Start and when the app closes');
  assert.equal(told(), ended(), 'the control window is told, with one notice and the count as it is now');
  // A Start that is cancelled while it is still listing the displays says it again (the records are still held).
  const listing = deferred<unknown[]>();
  w.h.sources.push(listing.promise);
  const starting = w.h.start('screen:1:0');
  w.h.end('stopped during Start');
  listing.resolve([w.h.source]);
  await starting;
  assert.match(ended()!, /^stopped during Start\. How 2 question\(s\) to ChatGPT ended /);
  assert.deepEqual([entryOf(first).outcome, entryOf(second).outcome], [null, null]);
  // The device can be written again: the next Start writes both, as they were held.
  w.h.failWrites.on = false;
  await running(w.h);
  assert.deepEqual([entryOf(first).outcome?.answer?.text, entryOf(first).shown], ['Shown on the first card.', true]);
  assert.deepEqual([entryOf(second).outcome, entryOf(second).shown, JSON.stringify(entryOf(second)).includes('after the Stop')], [{ status: 'cancelled', uncertain: true }, false, false], 'never shown, its text not kept');
  assert.equal(w.fakes.made.reduce((n, c) => n + c.turns().length, 0), 2, 'two circles, two sends');
  // The pictures on this device are as they were.
  for (const r of all) assert.equal(sha(fs.readFileSync(path.join(dir, r.image.file))), r.image.sha256);
});

test('[synthetic connector] an outcome that stays unwritten is said again at every later session\'s end (not in that session\'s manifest), holds the app\'s close once, and is tried as Windows ends the session and as the app quits', async () => {
  const w = await app();
  const ended = (): string | null => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended ?? null;
  const NOTICE = /^stopped by the test\. How 1 question\(s\) to ChatGPT ended .* and writing it is tried again at the next Start and when the app closes$/;
  await w.select();
  const folder = w.folder();
  const entry = (): Entry => (JSON.parse(fs.readFileSync(path.join(folder, 'asks', fs.readdirSync(path.join(folder, 'asks')).find((f) => f.endsWith('.json'))!), 'utf8')) as Rec).requests[0]!;
  w.h.failWrites.on = true;
  w.c().answer('Shown, and still unwritten.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  w.h.end('stopped by the test');
  await until('ended', () => ended() !== null, 5000);
  assert.match(ended()!, NOTICE);
  // A new session while that record still cannot be written: tried at the Start, and its end says it again.
  w.h.failWrites.on = false;
  w.h.failWrites.only = `${path.sep}asks${path.sep}`;
  const next = async () => overlayPage(w.h, await running(w.h), { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  const page = await next();
  assert.deepEqual([ended(), entry().outcome], [null, null], 'tried at the Start, and still unwritten');
  await page.review.sample();
  await page.review.retention().queue;
  const captures = path.join(w.h.userData, 'captures');
  const later = fs.readdirSync(captures).map((d) => path.join(captures, d)).find((d) => d !== folder)!;
  w.h.end('stopped by the test');
  await until('ended again', () => ended() !== null, 5000);
  assert.match(ended()!, NOTICE);
  const lines = fs.readFileSync(path.join(later, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { kind: string; reason?: string });
  assert.deepEqual([lines.at(-1)!.kind, lines.at(-1)!.reason], ['ended', 'stopped by the test'], 'that session\'s own manifest says only how it ended');
  // Closing the app during a session: its end says it, and the window stays once instead of quitting.
  await next();
  let prevented = false;
  w.control.emit('close', { preventDefault: () => (prevented = true) });
  await until('ended by the close', () => ended() !== null, 5000);
  await settle();
  assert.deepEqual([prevented, w.h.quits.n], [true, 0]);
  assert.match(ended()!, /^the app was closed\. How 1 question\(s\) to ChatGPT ended /);
  // The next close is not held for it: the connector is ended first, then the window closes by itself and the
  // app quits, once.
  w.control.close();
  await until('the app quit', () => w.h.quits.n === 1, 5000);
  assert.equal(w.control.destroyed, true);
  // Windows ending the user's session (no quit event then): tried, still unwritten; then written once it can be.
  w.control.emit('session-end');
  assert.equal(entry().outcome, null);
  w.h.failWrites.only = null;
  w.control.emit('query-session-end', { preventDefault: () => undefined });
  assert.deepEqual([entry().outcome?.answer?.text, entry().shown], ['Shown, and still unwritten.', true]);
  assert.equal(w.fakes.made.reduce((n, c) => n + c.turns().length, 0), 1, 'never asked again');
});

test('[synthetic connector] a record held unwritten is tried a last time as the app quits, and as Windows ends the session', async () => {
  for (const by of ['before-quit', 'session-end'] as const) {
    const w = await app();
    await w.select();
    const entry = (): Entry => w.records()[0]!.requests[0]!;
    w.h.failWrites.on = true;
    w.c().answer(`Written at ${by}.`);
    await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
    w.h.end('stopped by the test');
    await until('ended', () => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended != null, 5000);
    assert.equal(entry().outcome, null);
    w.h.failWrites.on = false;
    if (by === 'before-quit') w.h.app.emit('before-quit');
    else w.control.emit('session-end');
    assert.deepEqual([entry().outcome?.answer?.text, entry().shown, w.c().turns().length], [`Written at ${by}.`, true, 1]);
  }
});

test('[synthetic connector] a request the connector ends as cancelled by itself is said and recorded as not confirmed to have stopped, and is not sent again; the AI\'s session goes on', async () => {
  const w = await app();
  await w.select();
  w.c().fail(w.c().asks()[0]!.id, 'cancelled', 'submitted'); // the user pressed nothing
  await until('said', () => /^Cancelled/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().answer, w.page.ask().submit], [UNCONFIRMED, null, true]);
  assert.deepEqual(w.records()[0]!.requests.map((x) => [x.outcome, x.submission, x.shown]), [[{ status: 'cancelled', uncertain: true }, 'submitted', false]]);
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual([w.asks().length, w.c().count('companion/interrupt'), w.c().count('companion/stop'), w.fakes.made.length, w.sub().state, w.live().state, w.live().used], [1, 0, 0, 1, 'signed_in', 'on', 1], 'one send, no interrupt or Stop of this app, one connector; it may have reached ChatGPT, so it is counted');
});

// ---- the connector's end as the app closes: a small note on this device, and the next launch ------------------------
const SHIM_ENDED = 'a connector that was ended here did not end by itself in time; its wsl.exe shim was ended, which does not show that the connector, or the Codex app server it runs, ended in WSL';
const NOTE_LINE = /^\{"format":"lc-windows-connector-ends\/v1","ends":\[(\{"at":"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z","shim":"(ended|not_ended)"\},?)+\],"older":\d+\}\n$/;
/** The app with a connector that was checked and no capture session; `slow`: the connector ignores the end of its input. */
async function launched(o: { slow?: boolean; userData?: string; check?: boolean } = {}) {
  const fakes = fakeConnectors((c) => void (c.endDelayMs = o.slow ? 60_000 : 0));
  const env = { LC_SUBSCRIPTION_CONNECTOR: connectorConfig() };
  const h = harness({ env, ...(o.userData ? { userData: o.userData } : {}), subscription: { spawn: fakes.spawn, request_ms: 500, end_ms: 80 } });
  await settle();
  const control = h.control() as unknown as FakeWindow;
  const sub = (): Sub => plain(h.handlers['lc:sub-state']!({ sender: control.webContents })) as Sub;
  if (o.check !== false) {
    h.handlers['lc:sub-check']!({ sender: control.webContents });
    await until('signed in', () => sub().state === 'signed_in', 3000);
  }
  const file = path.join(h.userData, 'connector-ends.json');
  /** What the control window was last told of the subscription. */
  const told = (): Sub => plain(control.sent.filter((m) => m[0] === 'lc:sub').at(-1)?.[1]) as Sub;
  return { h, fakes, control, sub, told, file, env };
}
const earlierText = (n: number, at: string, notEnded: number, listed: number): string =>
  `earlier runs of this app recorded ${n} connector end(s) that were not seen (the latest at ${at}; wsl.exe shim not seen to end either: ${notEnded} of the ${listed} listed); these are past records: they do not show that anything is still running, or that it has ended since`;

test('[synthetic connector] a connector that does not end by itself as the app closes: the fact and its time are written before the app goes, and the next launch says it as a past record that a clean connection does not erase', async () => {
  const w = await launched({ slow: true });
  const c = w.fakes.last();
  let kills = 0;
  const kill = c.kill.bind(c);
  c.kill = () => (kills++, kill());
  assert.equal(fs.existsSync(w.file), false);
  const from = Date.now();
  w.control.close();
  // The window waits while the connector is ended; the app has not quit.
  assert.deepEqual([w.control.destroyed, w.h.quits.n, w.told().detail], [false, 0, 'the app is closing: the connector is being ended']);
  await until('the app quit', () => w.h.quits.n === 1, 5000);
  assert.deepEqual([w.control.destroyed, c.exited, kills, w.fakes.made.length], [true, true, 1, 1], 'its shim was ended once; nothing was started');
  // The note: one line of this format, a time and one word. Nothing else.
  const raw = fs.readFileSync(w.file, 'utf8');
  assert.match(raw, NOTE_LINE);
  const note = JSON.parse(raw) as { format: string; ends: Array<{ at: string; shim: string }>; older: number };
  assert.deepEqual([note.format, note.ends.length, note.ends[0]!.shim, note.older, Object.keys(note.ends[0]!).sort()], ['lc-windows-connector-ends/v1', 1, 'ended', 0, ['at', 'shim']]);
  assert.equal(Date.parse(note.ends[0]!.at) >= from && Date.parse(note.ends[0]!.at) <= Date.now(), true);
  for (const secret of [w.h.userData, 'auth', 'openai', 'LC_', 'python', 'synthetic', 'ask-', 'png']) assert.equal(raw.includes(secret), false, secret);
  // The next launch of the app, on the same app data: said at once, as a past record; nothing is started by it.
  const next = await launched({ userData: w.h.userData, check: false });
  const PAST = earlierText(1, note.ends[0]!.at, 0, 1);
  assert.deepEqual([next.sub().state, next.sub().detail, next.fakes.made.length], ['not_checked', PAST, 0]);
  // A connection that works, and ends by itself, does not erase it: said beside the state, and the file is as it was.
  next.h.handlers['lc:sub-check']!({ sender: next.control.webContents });
  await until('signed in', () => next.sub().state === 'signed_in', 3000);
  assert.equal(next.sub().detail, PAST);
  next.control.close();
  await until('the app quit', () => next.h.quits.n === 1, 5000);
  assert.deepEqual([next.fakes.last().exited, fs.readFileSync(next.file, 'utf8')], [true, raw], 'ended by itself: nothing is added, nothing removed');
  // A third launch still says it.
  const third = await launched({ userData: w.h.userData, check: false });
  assert.equal(third.sub().detail, PAST);
});

test('[synthetic connector] the note of an unseen end that cannot be written is not taken as saved: the window stays once and says so; it is tried again as the app quits', async () => {
  for (const later of ['still failing', 'writable again'] as const) {
    const w = await launched({ slow: true });
    w.h.failWrites.only = 'connector-ends';
    w.control.close();
    await until('said', () => /is not written on this device/.test(w.sub().detail ?? ''), 5000);
    await settle();
    assert.equal(w.sub().detail, `${SHIM_ENDED}; this is not written on this device as it is said here (Error: EIO: i/o error (injected)); writing it is tried again as the app quits, and unless that works the next launch will not say it as it is said here`);
    assert.deepEqual([w.told().detail, w.control.destroyed, w.h.quits.n, fs.existsSync(w.file)], [w.sub().detail, false, 0, false], 'the window is told, stays, and nothing is on the device');
    // The next close is not held for it. As the app quits the write is tried once more.
    if (later === 'writable again') w.h.failWrites.only = null;
    w.control.close();
    await until('the app quit', () => w.h.quits.n === 1, 5000);
    assert.equal(w.control.destroyed, true);
    assert.equal(fs.existsSync(w.file), later === 'writable again');
    if (later === 'writable again') assert.match(fs.readFileSync(w.file, 'utf8'), NOTE_LINE);
    assert.equal(w.fakes.made.length, 1);
    // What the next launch can say follows what is on the device.
    const next = await launched({ userData: w.h.userData, check: false });
    assert.equal(next.sub().detail === null, later === 'still failing');
  }
});

test('[synthetic connector] a connector that ends by itself as the app closes leaves no note; one ended while the app runs is written at once; the note is bounded and an unreadable one is left untouched', async () => {
  // Clean: the window closes by itself, the app quits once, nothing is written.
  const clean = await launched();
  clean.control.close();
  await until('the app quit', () => clean.h.quits.n === 1, 5000);
  assert.deepEqual([clean.control.destroyed, clean.fakes.last().exited, fs.existsSync(clean.file)], [true, true, false]);
  // No connector was ever started: the close is not held at all.
  const idle = await launched({ check: false });
  idle.control.close();
  assert.equal(idle.control.destroyed, true);
  await until('the app quit', () => idle.h.quits.n === 1, 5000);
  assert.deepEqual([idle.fakes.made.length, fs.existsSync(idle.file)], [0, false]);
  // Ended while the app runs (a line that is not the envelope's), not ending by itself: written then, said then.
  const run = await launched({ slow: true });
  run.fakes.last().stdout.write('x'.repeat(LIVE_LINE_FROM_CONNECTOR_MAX + 1));
  await until('said', () => run.sub().detail === SHIM_ENDED, 5000);
  assert.match(fs.readFileSync(run.file, 'utf8'), NOTE_LINE);
  run.control.close(); // nothing runs and nothing is unwritten: not held
  assert.equal(run.control.destroyed, true);
  // Bounded: the newest fifty are listed, older ones only counted; the next launch says how many in all.
  const full = await launched({ slow: true });
  const old = Array.from({ length: 50 }, (_, i) => ({ at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(), shim: i === 49 ? 'not_ended' : 'ended' }));
  fs.writeFileSync(full.file, `${JSON.stringify({ format: 'lc-windows-connector-ends/v1', ends: old, older: 2 })}\n`);
  const again = await launched({ slow: true, userData: full.h.userData });
  assert.equal(again.sub().detail, earlierText(52, old[49]!.at, 1, 50));
  again.control.close();
  await until('the app quit', () => again.h.quits.n === 1, 5000);
  const kept = JSON.parse(fs.readFileSync(again.file, 'utf8')) as { ends: Array<{ at: string; shim: string }>; older: number };
  assert.deepEqual([kept.ends.length, kept.older, kept.ends[0]!.at, kept.ends[48]!.shim, kept.ends[49]!.shim], [50, 3, old[1]!.at, 'not_ended', 'ended']);
  // An end that was written and has since moved out of the listed fifty is counted once: its shim's late exit, said
  // again, adds nothing.
  const packed = await launched({ check: false });
  const future = Array.from({ length: 50 }, (_, i) => ({ at: new Date(Date.UTC(2099, 0, 1, 0, 0, i)).toISOString(), shim: 'ended' }));
  fs.writeFileSync(packed.file, `${JSON.stringify({ format: 'lc-windows-connector-ends/v1', ends: future, older: 0 })}\n`);
  const counted = await launched({ slow: true, userData: packed.h.userData });
  const stuck = counted.fakes.last();
  stuck.kill = () => true; // its shim is not seen to end
  stuck.stdout.write('x'.repeat(LIVE_LINE_FROM_CONNECTOR_MAX + 1));
  const stored = (): { ends: Array<{ at: string; shim: string }>; older: number } => JSON.parse(fs.readFileSync(counted.file, 'utf8')) as never;
  await until('written: older than every listed one, so only counted', () => stored().older === 1, 6000);
  assert.deepEqual(stored().ends, future);
  stuck.exit(0); // its exit, late: the same end again
  await until('taken', () => /shim was ended/.test(counted.sub().detail ?? ''));
  assert.deepEqual([stored().older, stored().ends], [1, future], '51 ends in all, not 52');
  // Not readable as this format: said, left as it is, and a new end is not written over it.
  for (const bad of ['not json', '{"format":"another/v1","ends":[],"older":0}', `{"format":"lc-windows-connector-ends/v1","ends":[{"at":"2026-01-01T00:00:00.000Z","shim":"ended","path":"C:\\\\Users\\\\x"}],"older":0}`, '{"format":"lc-windows-connector-ends/v1","ends":[{"at":"yesterday","shim":"ended"}],"older":0}']) {
    const seed = await launched({ check: false });
    fs.writeFileSync(seed.file, bad);
    const w = await launched({ slow: true, userData: seed.h.userData });
    assert.equal(w.sub().detail, 'the record of connector ends from earlier runs could not be read on this device, and is left as it is', bad);
    w.control.close();
    await until('said', () => /is not written on this device/.test(w.sub().detail ?? ''), 5000);
    assert.equal(w.sub().detail, `${SHIM_ENDED}; this is not written on this device as it is said here (the record of connector ends on this device is not readable, so it is left untouched); writing it is tried again as the app quits, and unless that works the next launch will not say it as it is said here; the record of connector ends from earlier runs could not be read on this device, and is left as it is`);
    assert.deepEqual([fs.readFileSync(w.file, 'utf8'), w.control.destroyed], [bad, false]);
  }
});

test('[synthetic connector] the close also waits for a connector that was ended earlier and is still ending; nothing is started while it waits; the lines of the note stay in the order of their times', async () => {
  // Ended while the app runs (a line that is not the envelope's), still within its time when the window is closed,
  // and its note cannot be written: the window is held and says so, as for one ended by the close itself.
  const w = await launched({ slow: true });
  w.h.failWrites.only = 'connector-ends';
  w.fakes.last().stdout.write('x'.repeat(LIVE_LINE_FROM_CONNECTOR_MAX + 1));
  await until('ended here', () => w.sub().state === 'unavailable');
  assert.deepEqual([w.fakes.last().exited, w.sub().detail], [false, null], 'still within its time');
  w.control.close();
  assert.deepEqual([w.control.destroyed, w.h.quits.n, w.told().detail], [false, 0, 'the app is closing: the connector is being ended']);
  // While the close waits, the user's presses start nothing that the close would then end.
  w.h.handlers['lc:sub-check']!({ sender: w.control.webContents });
  w.h.handlers['lc:sub-login']!({ sender: w.control.webContents });
  assert.deepEqual(plain(await w.h.handlers['lc:start']!({ sender: w.control.webContents }, 'screen:1:0')), { ok: false, reason: 'the app is closing' });
  await until('said', () => /is not written on this device/.test(w.sub().detail ?? ''), 5000);
  await settle();
  assert.deepEqual([w.control.destroyed, w.h.quits.n, w.fakes.made.length, w.h.opened, w.h.current(), fs.existsSync(w.file)], [false, 0, 1, [], null, false], 'held; no second connector, no sign-in page, no session');
  // The close was given up (the window stays for what could not be written): the presses work again.
  w.h.failWrites.only = null;
  w.h.handlers['lc:sub-check']!({ sender: w.control.webContents });
  await until('a new connector, by the press', () => w.fakes.made.length === 2 && w.sub().state === 'signed_in', 3000);
  // Closed again: this second connector does not end by itself either. Both lines are written, in the order of
  // their times, also when the first one's shim exit is seen late.
  const first = w.fakes.made[0]!;
  w.control.close();
  await until('the app quit', () => w.h.quits.n === 1, 5000);
  const note = JSON.parse(fs.readFileSync(w.file, 'utf8')) as { ends: Array<{ at: string; shim: string }>; older: number };
  assert.deepEqual([note.ends.length, note.ends.map((e) => e.shim), note.ends[0]!.at <= note.ends[1]!.at, first.exited], [2, ['ended', 'ended'], true, true]);
  // The next launch names the later one as the latest.
  const next = await launched({ userData: w.h.userData, check: false });
  assert.equal(next.sub().detail, earlierText(2, note.ends[1]!.at, 0, 2));
});

test('[synthetic connector] a line of the note that is written again keeps its place; a launch whose connector configuration cannot be used still says the past record', async () => {
  // Two ends in one run: the first one's shim is not seen to end, the second one's is; then the first one's exit comes.
  const w = await launched({ slow: true });
  const a = w.fakes.last();
  a.kill = () => true; // the kill is taken and nothing ends
  a.stdout.write('x'.repeat(LIVE_LINE_FROM_CONNECTOR_MAX + 1));
  await until('the first is written as not ended', () => fs.existsSync(w.file) && /not_ended/.test(fs.readFileSync(w.file, 'utf8')), 6000);
  w.h.handlers['lc:sub-check']!({ sender: w.control.webContents });
  await until('a second connector', () => w.fakes.made.length === 2 && w.sub().state === 'signed_in', 3000);
  w.fakes.last().stdout.write('x'.repeat(LIVE_LINE_FROM_CONNECTOR_MAX + 1));
  await until('the second is written', () => (JSON.parse(fs.readFileSync(w.file, 'utf8')) as { ends: unknown[] }).ends.length === 2, 6000);
  const before = JSON.parse(fs.readFileSync(w.file, 'utf8')) as { ends: Array<{ at: string; shim: string }> };
  assert.deepEqual(before.ends.map((e) => e.shim), ['not_ended', 'ended']);
  a.exit(0); // the first one's shim exit, late
  await until('written again', () => !/not_ended/.test(fs.readFileSync(w.file, 'utf8')));
  const after = JSON.parse(fs.readFileSync(w.file, 'utf8')) as { ends: Array<{ at: string; shim: string }>; older: number };
  assert.deepEqual([after.ends.map((e) => e.at), after.ends.map((e) => e.shim), after.older], [before.ends.map((e) => e.at), ['ended', 'ended'], 0], 'the same two times, in the same order');
  // The next launch names a connector configuration that cannot be used: the past record is still said.
  const h = harness({ env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig({}, { kind: 'posix', python: '/p', cwd: '/b' }) }, userData: w.h.userData });
  await settle();
  assert.deepEqual(plain(h.handlers['lc:sub-state']!({ sender: (h.control() as unknown as FakeWindow).webContents })), { mode: 'unavailable', reason: `the subscription connector configuration is not valid; ${earlierText(2, after.ends[1]!.at, 0, 2)}` });
  // Without any connector named the subscription is off, and the note is left as it is.
  const off = harness({ userData: w.h.userData });
  await settle();
  assert.deepEqual(plain(off.handlers['lc:sub-state']!({ sender: (off.control() as unknown as FakeWindow).webContents })), { mode: 'off' });
  assert.deepEqual(JSON.parse(fs.readFileSync(w.file, 'utf8')), JSON.parse(JSON.stringify({ format: 'lc-windows-connector-ends/v1', ...after })));
});

test('[synthetic connector] every new request is taken only from its own window', async () => {
  const w = await app();
  const id = await w.select();
  const overlay = { sender: w.s.overlay.webContents };
  const control = { sender: w.control.webContents };
  const stranger = { sender: {} };
  const doc = w.page.review.state().doc;
  const frame = { frame_seq: 1, frame_captured_at: '2026-09-30T12:00:00.000Z', frame_width: 1280, frame_height: 800, ink_session: doc.id, ink_revision: doc.ink.revision, visible_strokes: doc.ink.visible.length };
  const whole = Uint8Array.from(pngOf(1280, 800, 20));
  const ink = new TextEncoder().encode(JSON.stringify(doc));
  // The overlay's requests, from the control window or anything else (each well formed: only its sender is wrong).
  for (const from of [control, stranger]) {
    assert.deepEqual(plain(await w.h.handlers['lc:ask-selection']!(from, { ...frame, region_dip: CIRCLE }, whole, ink)), { ok: false, reason: 'refused' });
    assert.deepEqual(plain(await w.h.handlers['lc:ask-submit']!(from, id, 'q', 'hint', frame, whole, ink)), { ok: false, reason: 'refused' });
    w.h.handlers['lc:ask-cancel']!(from, id);
    w.h.handlers['lc:ask-closed']!(from);
  }
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([w.asks().length, w.c().count('companion/interrupt'), w.records().length], [1, 0, 1], 'still the current selection, its own request out and not interrupted; nothing else was kept or sent');
  // The control window's presses, from the overlay or anything else.
  const before = w.c().calls.length;
  for (const from of [overlay, stranger]) {
    assert.equal(plain(await w.h.handlers['lc:sub-state']!(from)), null);
    assert.equal(plain(await w.h.handlers['lc:session-state']!(from)), null);
    for (const channel of ['lc:sub-check', 'lc:sub-login', 'lc:sub-login-cancel', 'lc:live-stop']) w.h.handlers[channel]!(from);
    w.h.handlers['lc:sub-model']!(from, 'text-only-model');
    assert.deepEqual(plain(await w.h.handlers['lc:live-start']!(from, POLICY)), { ok: false, reason: 'refused' });
    assert.deepEqual(plain(await w.h.handlers['lc:start']!(from, 'screen:1:0', { policy: POLICY })), { ok: false, reason: 'refused' });
  }
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([w.c().calls.length, w.h.opened, w.sub().model, w.live().state], [before, [], 'vision-model', 'on'], 'the AI\'s session is neither stopped nor started by them');
  w.c().answer('ok');
  await until('answered', () => w.page.ask().answer !== null);
});

test('a connector configuration that cannot be used keeps the subscription off, and says so; the app is otherwise as before', async () => {
  const h = harness({ env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig({}, { kind: 'posix', python: '/p', cwd: '/b' }) } });
  const s = await running(h, { policy: POLICY }); // a Start that asks for the AI: there is none to start
  const control = { sender: (h.control() as unknown as FakeWindow).webContents };
  const status = plain(h.handlers['lc:sub-state']!(control));
  assert.deepEqual(status, { mode: 'unavailable', reason: 'the subscription connector configuration is not valid' });
  const p = controlPage();
  p.showSubscription(status);
  assert.deepEqual([p.nodes['subState']!.textContent, p.nodes['ai']!.textContent, p.nodes['subCheck']!.hidden], ['ChatGPT subscription: off. the subscription connector configuration is not valid.', 'No AI is connected: captured frames and ink stay on this device, and nothing is sent anywhere.', true]);
  assert.deepEqual([p.nodes['start']!.textContent, p.nodes['aiSession']!.hidden], ['Start', true], 'Start is the capture alone, and nothing beside it offers an AI');
  assert.equal((plain(await h.handlers['lc:overlay-ready']!({ sender: s.overlay.webContents })) as { subscription: boolean }).subscription, false);
  assert.deepEqual((plain(h.handlers['lc:session-state']!(control)) as { live: unknown }).live, { state: 'none' });
});
