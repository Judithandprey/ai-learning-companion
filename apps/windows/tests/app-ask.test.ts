// ASK with the managed ChatGPT subscription, through the app: the real main.ts and overlay.ts under the unit-test
// fakes. A selection is retained as its exact picture, facts and ink; nothing is sent until the user presses Ask; the
// answer is shown only on the card of the selection and request it belongs to; Cancel, a new selection, Stop and the
// session's end fence unsent work and suppress late answers; nothing is sent again.
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
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { parseDesktopInk } from '../src/shared/desktop-ink.ts';
import { connectorConfig, fakeConnectors, removeConfigs, type FakeConnector } from './subscription-fakes.ts';
import type { AskRequest } from '../src/shared/subscription-ask.ts';

after(quitLinks);
after(removeConfigs);
const sha = (b: Uint8Array | string): string => crypto.createHash('sha256').update(b).digest('hex');
type Sub = { mode: string; state?: string; login?: string; model?: string | null; asking?: boolean; detail?: string | null };

/** The app with the subscription configured and a stand-in connector; optionally already checked (signed in). */
async function app(o: { check?: boolean; configure?: (c: FakeConnector) => void; leaky?: boolean; ask_ms?: number } = {}) {
  const fakes = fakeConnectors(o.configure);
  const h = harness({ env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig() }, subscription: { spawn: fakes.spawn, request_ms: 500, ask_ms: o.ask_ms ?? 20_000, end_ms: 500 }, ...(o.leaky ? { leakySubscription: true } : {}) });
  const s = await running(h);
  const control = h.control() as unknown as FakeWindow;
  const press = (channel: string, ...args: unknown[]): unknown => h.handlers[channel]!({ sender: control.webContents }, ...args);
  const sub = (): Sub => plain(press('lc:sub-state')) as Sub;
  if (o.check !== false) {
    press('lc:sub-check');
    await until('signed in', () => sub().state === 'signed_in', 3000);
  }
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  page.scene.exactPng = true;
  const captures = path.join(h.userData, 'captures');
  const folder = (): string => path.join(captures, fs.readdirSync(captures)[0]!);
  const records = (): Array<Record<string, unknown> & { requests: Array<Record<string, unknown>>; context: AskRequest['context']; image: { file: string; sha256: string }; ink_original: { file?: string; sha256?: string } }> =>
    fs.existsSync(path.join(folder(), 'asks')) ? fs.readdirSync(path.join(folder(), 'asks')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(folder(), 'asks', f), 'utf8'))) : [];
  /** An ASK circle on the overlay; resolves once the card shows (and, with a retained selection, its form). */
  const select = async (x = 190, width = 210): Promise<void> => {
    page.press('ASK');
    page.pointer('pointerdown', 2, x, 95);
    for (const [px, py] of [[x + width, 95], [x + width, 125], [x, 125]] as const) page.pointer('pointermove', 2, px, py);
    page.pointer('pointerup', 2, x + 2, 97);
    // This selection's own card (not one still open from before), with its form or the reason it has none.
    await until('the ASK card', () => page.review.card()?.text.includes(`Region ${x - 8},87 `) === true && (page.ask().form || /cannot be asked/.test(page.ask().status ?? '')));
  };
  return { h, s, fakes, page, press, sub, folder, records, select, control };
}

test('without the subscription configured nothing changes: no question form, nothing retained for ASK, and the requests are refused', async () => {
  const h = harness();
  const s = await running(h);
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
  assert.deepEqual(plain(h.handlers['lc:sub-state']!({ sender: (h.control() as unknown as FakeWindow).webContents })), { mode: 'off' });
  const captures = path.join(h.userData, 'captures');
  assert.equal(fs.existsSync(captures) && fs.readdirSync(captures).some((d) => fs.existsSync(path.join(captures, d, 'asks'))), false);
});

test('[synthetic connector] capturing, writing, erasing and selecting send nothing to any AI: no connector is even started until the user presses', async () => {
  const w = await app({ check: false });
  assert.deepEqual([w.sub().state, w.fakes.made.length], ['not_checked', 0]);
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
  // A selection is retained on this device; its card says it cannot be asked about yet, and nothing was sent.
  await w.select();
  assert.equal(w.fakes.made.length, 0, 'no connector child at all');
  assert.equal(w.records().length, 1, 'the selection is kept on this device');
  assert.deepEqual(w.records()[0]!.requests, []);
  // Pressing Ask while not checked: refused here, still nothing started.
  w.page.click('askSubmit');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, 'Not sent: the ChatGPT subscription has not been checked yet (use the control window).');
  assert.equal(w.fakes.made.length, 0);
});

test('[synthetic connector] a selection is retained as its exact picture, the facts of its frame and the exact ink drawn into it; the mode before returns at once', async () => {
  const w = await app();
  // A stroke first, so the ink document is not empty.
  w.page.pointer('pointerdown', 1, 200, 105);
  for (const x of [240, 280]) w.page.pointer('pointermove', 1, x, 105);
  w.page.pointer('pointerup', 1, 280, 105);
  await w.page.review.pending();
  await w.select();
  assert.equal(w.page.review.state().doc.ink.revision >= 1, true);
  assert.deepEqual([w.page.ask().form, w.page.ask().submit, w.page.ask().cancel], [true, true, false]);
  assert.match(w.page.hint() ?? '', /Pen writes|Pen and mouse write/, 'WRITE, the mode before, is back while the card stays');
  assert.match(w.page.review.card()!.text, /^This selection is sent to ChatGPT, with your question, only when you press Ask below; nothing else of the screen is sent to any AI, and no AI watches it\.\n/);
  assert.equal(w.page.ask().badge, 'Selection · not sent to any AI');
  assert.match(w.page.hint() ?? '', /No AI watches this screen: ChatGPT gets only a selection you send with Ask\./);
  const [r] = w.records();
  assert.equal(r!['format'], 'lc-windows-ask/v1');
  // The picture: content-addressed under asks/, its bytes hash to the name, its size the region's pixels.
  const png = fs.readFileSync(path.join(w.folder(), r!.image.file));
  assert.equal(r!.image.file, `asks/${sha(png)}.png`);
  const c = r!.context;
  assert.deepEqual([c.capture_session_id, c.frame_seq, c.frame_width, c.frame_height, c.display.bounds, c.display.scale_factor], [path.basename(w.folder()), 1, 1280, 800, { x: 0, y: 0, width: 1280, height: 800 }, 1]);
  assert.deepEqual([c.region_dip, c.region_px], [{ x: 182, y: 87, width: 226, height: 46 }, { x: 182, y: 87, width: 226, height: 46 }]);
  assert.deepEqual([c.frame_captured_at, c.source_url, c.source_version, c.media_position], ['2026-09-30T12:00:00.000Z', null, null, null], 'the frame\'s own time; nothing unknown is made up');
  // The ink: the exact document drawn into the selection, read back strictly, bound by its hash and revision.
  const ink = fs.readFileSync(path.join(w.folder(), r!.ink_original.file!));
  assert.deepEqual([sha(ink), r!.ink_original.sha256], [c.ink_sha256, c.ink_sha256]);
  const doc = JSON.parse(ink.toString('utf8'));
  const read = parseDesktopInk(doc, sha(doc.id));
  assert.equal(read.ok && read.doc.ink.revision, c.ink_revision);
  assert.equal(w.fakes.last().count('ask/start'), 0, 'retaining a selection sends nothing');
});

test('[synthetic connector] Ask sends that picture and the question once; the answer is shown as text on its own card, apart from the selection, and recorded', async () => {
  const w = await app();
  await w.select();
  w.page.question('  What does this show?  ');
  w.page.choose('explain');
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  const sent = w.fakes.last().asks()[0]!.params as { request: AskRequest; model: string };
  const [r] = w.records();
  // What was sent is what the main process retained, not what a page could claim.
  assert.equal(sent.model, 'vision-model');
  assert.deepEqual([sent.request.question, sent.request.assistance, sent.request.context], ['What does this show?', 'explain', r!.context]);
  const png = fs.readFileSync(path.join(w.folder(), r!.image.file));
  assert.deepEqual([Buffer.from(sent.request.image.png_base64, 'base64').equals(png), sent.request.image.sha256, sent.request.image.width, sent.request.image.height], [true, r!.image.sha256, 226, 46]);
  assert.deepEqual([r!.requests.length, r!.requests[0]!['request_id'], r!.requests[0]!['outcome']], [1, sent.request.request_id, null], 'written before it was sent');
  await until('the card says it was asked', () => w.page.ask().badge === 'Selection · asked: being sent to ChatGPT');
  assert.deepEqual([w.page.ask().submit, w.page.ask().cancel], [false, true]);
  assert.match(w.page.ask().status ?? '', /^Asked at .* \(vision-model\): this picture and your question are being sent to ChatGPT\. Waiting for the answer…$/);
  assert.equal(w.sub().asking, true);
  const card = w.page.review.card()!.text;
  w.fakes.last().answer('It shows <b>a number line</b> from 0 to 5.');
  await until('answered', () => w.page.ask().answer !== null);
  assert.equal(w.page.ask().answer, 'It shows <b>a number line</b> from 0 to 5.', 'as text, never markup');
  assert.equal(w.page.ask().status, 'Answered by ChatGPT (vision-model) in 1.2 s, about the picture above and your question only.');
  assert.deepEqual([w.page.review.card()!.text, w.page.ask().submit, w.page.ask().cancel, w.page.ask().badge], [card, true, false, 'Selection · answered by ChatGPT below'], 'the selection\'s own text is unchanged; another question may be asked');
  const entry = w.records()[0]!.requests[0]!;
  assert.deepEqual([(entry['outcome'] as { status: string; answer: { text: string } }).status, (entry['outcome'] as { answer: { text: string } }).answer.text, entry['shown'], entry['model']], ['answered', 'It shows <b>a number line</b> from 0 to 5.', true, 'vision-model']);
  assert.deepEqual(fs.readFileSync(path.join(w.folder(), r!.image.file)), png, 'the original picture is untouched');
  assert.equal(w.fakes.last().asks().length, 1, 'sent once');
});

test('[synthetic connector] Cancel while a question is out: its answer is never shown, whatever arrives, and it is not sent again', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  await w.select();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.page.click('askCancel');
  assert.equal(w.page.ask().status, 'Cancelling: an answer that still arrives is not shown.');
  await until('cancel told', () => w.fakes.last().count('ask/cancel') === 1);
  w.fakes.last().answer('A late answer that must not be shown.');
  await until('ended', () => /^Cancelled/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, 'Cancelled: no answer is shown. Whether ChatGPT stopped working on it is not confirmed; it may still have counted against your usage.');
  assert.equal(w.page.ask().answer, null);
  const entry = w.records()[0]!.requests[0]!;
  assert.deepEqual([(entry['outcome'] as { status: string }).status, entry['shown']], ['cancelled', false]);
  assert.equal(JSON.stringify(w.records()).includes('late answer'), false, 'not kept as an answer either');
  assert.equal(w.fakes.last().asks().length, 1);
});

test('[synthetic connector] a new selection while a question is out: the first is cancelled, and its late answer is never shown on the new card', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  await w.select();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  const first = w.fakes.last().asks()[0]!;
  await w.select(600, 120); // another region: a new selection, a new card
  await until('the first cancelled', () => w.fakes.last().count('ask/cancel') === 1);
  assert.deepEqual([w.page.ask().form, w.page.ask().submit, w.page.ask().answer, w.page.ask().badge], [true, true, null, 'Selection · not sent to any AI']);
  w.fakes.last().answer('The answer to the FIRST selection.', undefined, first);
  await settle();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([w.page.ask().answer, w.page.ask().status], [null, null], 'nothing of the first question on the new card');
  assert.equal(w.records().length, 2);
  // The new selection can be asked about once the first has ended.
  await until('the first ended', () => w.sub().asking === false);
  w.page.click('askSubmit');
  await until('the second sent', () => w.fakes.last().asks().length === 2);
  assert.notEqual((w.fakes.last().asks()[1]!.params as { request: AskRequest }).request.image.sha256, (first.params as { request: AskRequest }).request.image.sha256);
  w.fakes.last().answer('The answer to the second selection.');
  await until('answered', () => w.page.ask().answer !== null);
  assert.equal(w.page.ask().answer, 'The answer to the second selection.');
});

test('[synthetic connector] Stop while a question is out: the session is fenced, the connector told, a late answer never shown, and nothing more is asked', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  await w.select();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  const session = path.basename(w.folder());
  w.h.end('stopped by the test');
  assert.equal(w.fakes.last().count('session/stop'), 1, 'told by the Stop itself, before the overlay has answered it');
  assert.deepEqual(w.fakes.last().calls.find((c) => c.method === 'session/stop')!.params, { capture_session_id: session });
  w.fakes.last().answer('An answer after the Stop.');
  await until('ended', () => w.sub().asking === false);
  assert.equal(w.page.ask().answer, null);
  const entry = w.records()[0]!.requests[0]!;
  assert.deepEqual([(entry['outcome'] as { status: string }).status, entry['shown']], ['cancelled', false]);
  // The same session never asks again.
  assert.deepEqual(plain(await w.h.handlers['lc:ask-submit']!({ sender: w.s.overlay.webContents }, w.records()[0]!['selection_id'], 'again?', 'hint')), { ok: false, reason: 'refused' });
  assert.equal(w.fakes.last().asks().length, 1);
});

test('[synthetic connector] the app\'s own fence, whatever the connector layer does: an answer for a replaced selection, or after Stop, is not shown and its text not kept', async () => {
  // The subscription layer here forgets every cancel and Stop (a fault), so the answers do come back to the app.
  const w = await app({ leaky: true });
  await w.select();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  const first = w.fakes.last().asks()[0]!;
  await w.select(600, 120);
  w.fakes.last().answer('The answer to the FIRST selection.', undefined, first);
  await until('the first ended', () => w.sub().asking === false);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([w.page.ask().answer, w.page.ask().status], [null, null], 'not shown on the new card');
  assert.equal(JSON.stringify(w.records()).includes('FIRST selection'), false, 'nor kept as an answer');
  // After Stop: the same.
  w.page.click('askSubmit');
  await until('the second sent', () => w.fakes.last().asks().length === 2);
  w.h.end('stopped by the test');
  w.fakes.last().answer('An answer AFTER the Stop.');
  await until('ended', () => w.sub().asking === false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(w.page.ask().answer, null);
  assert.equal(JSON.stringify(w.records()).includes('AFTER the Stop'), false);
  assert.deepEqual(w.records().flatMap((r) => r.requests.map((x) => [(x['outcome'] as { status: string }).status, x['shown']])), [['cancelled', false], ['cancelled', false]]);
});

test('[synthetic connector] refusals and an answer that never comes are said as they are, and never sent again by the app', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent'), ask_ms: 400 });
  await w.select();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.fakes.last().fail(w.fakes.last().asks()[0]!.id, 'quota');
  await until('refused', () => /^No answer/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().badge], ['No answer: the subscription\'s usage limit was reached. It was not sent again.', 'Selection · asked: no answer shown']);
  assert.equal(w.page.ask().status!.includes('raw message'), false);
  // The user asks again, explicitly; no answer comes within the bound.
  w.page.click('askSubmit');
  await until('sent again by the user', () => w.fakes.last().asks().length === 2);
  await until('given up', () => /^No answer: no answer came/.test(w.page.ask().status ?? ''), 3000);
  assert.equal(w.page.ask().status, 'No answer: no answer came; whether ChatGPT worked on the question is not known. It is not sent again automatically.');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(w.fakes.last().asks().length, 2, 'two presses, two sends; none by the app itself');
  const outcomes = w.records()[0]!.requests.map((x) => (x['outcome'] as { status: string }).status);
  assert.deepEqual(outcomes, ['refused', 'uncertain']);
});

test('[synthetic connector] what a page claims is checked by the main process: a selection that is not the frame\'s, a stale selection, an empty question', async () => {
  const w = await app();
  await w.select();
  const from = { sender: w.s.overlay.webContents };
  const id = w.records()[0]!['selection_id'] as string;
  assert.deepEqual(plain(await w.h.handlers['lc:ask-submit']!(from, 'ask-0000000000000000', 'q', 'hint')), { ok: false, reason: 'this is no longer the current selection' });
  assert.deepEqual(plain(await w.h.handlers['lc:ask-submit']!(from, id, '   ', 'hint')), { ok: false, reason: 'the question is empty or too long' });
  assert.deepEqual(plain(await w.h.handlers['lc:ask-submit']!(from, id, 'q', 'everything')), { ok: false, reason: 'the kind of help is not chosen' });
  const facts = { region_dip: { x: 10, y: 10, width: 20, height: 10 }, frame_seq: 1, frame_captured_at: '2026-09-30T12:00:00.000Z', frame_width: 1280, frame_height: 800, ink_session: path.basename(w.folder()), ink_revision: 0, visible_strokes: 0 };
  const bad = async (f: object, png: unknown = new Uint8Array(8)): Promise<string> => (plain(await w.h.handlers['lc:ask-selection']!(from, f, png, new Uint8Array(2))) as { reason: string }).reason;
  assert.equal(await bad({ ...facts, region_dip: { x: 2000, y: 10, width: 20, height: 10 } }), 'the selected region is not inside the display');
  assert.equal(await bad({ ...facts, frame_width: 99999 }), 'the frame is larger than the chosen display');
  assert.equal(await bad({ ...facts, frame_captured_at: 'yesterday' }), 'the selection facts are malformed');
  assert.match(await bad(facts), /the selection's picture is not a PNG/);
  assert.match(await bad(facts, new Uint8Array(9 * 1024 * 1024)), /is over 8388608 bytes/);
  // From another window: refused.
  assert.deepEqual(plain(await w.h.handlers['lc:ask-submit']!({ sender: w.control.webContents }, id, 'q', 'hint')), { ok: false, reason: 'refused' });
  assert.equal(w.fakes.last().asks().length, 0);
});

test('[synthetic connector] the control window: check, sign in and model are the user\'s presses; the texts say what is so and that no AI watches', async () => {
  const w = await app({ check: false, configure: (c) => void (c.account = { auth: { state: 'signed_out', mode: null, plan: null }, rate_limits: null, models: [] }) });
  const shown = (): { header: string; state: string; quota: string | null; login: boolean; cancel: boolean; model: boolean } => {
    const p = controlPage();
    p.showSubscription(w.sub());
    return { header: p.nodes['ai']!.textContent, state: p.nodes['subState']!.textContent, quota: p.nodes['subQuota']!.hidden ? null : p.nodes['subQuota']!.textContent, login: !p.nodes['subLogin']!.hidden, cancel: !p.nodes['subLoginCancel']!.hidden, model: !p.nodes['subModelRow']!.hidden };
  };
  assert.equal(shown().header, 'Captured frames and ink stay on this device. No AI watches the screen: ChatGPT (your subscription) gets only a selection you send with Ask, with your question.');
  assert.match(shown().state, /^Not checked yet\./);
  assert.deepEqual([shown().login, w.h.opened], [false, []]);
  w.press('lc:sub-check');
  await until('read', () => w.sub().state === 'signed_out');
  assert.deepEqual([shown().state, shown().login, shown().quota, shown().model], ['Not signed in. Sign in with ChatGPT opens the official sign-in page in your browser.', true, null, false]);
  assert.deepEqual(w.h.opened, [], 'reading the state opened nothing');
  w.press('lc:sub-login');
  await until('waiting', () => w.sub().login === 'waiting');
  assert.deepEqual([w.h.opened, shown().cancel], [['https://auth.openai.com/oauth/authorize?client=synthetic'], true]);
  assert.equal(JSON.stringify(w.sub()).includes('auth.openai.com'), false);
  // The sign-in completes: the account is read again.
  w.fakes.last().account = { auth: { state: 'signed_in', mode: 'chatgpt', plan: 'Pro' }, rate_limits: [{ label: '5 h', used_percent: 12.4, resets_at: null }], models: [{ id: 'a', label: 'A', image_input: true, default: false }, { id: 'b', label: 'B', image_input: true, default: true }, { id: 't', label: 'T', image_input: false, default: false }] };
  w.fakes.last().event('connection/login/completed', { login_id: 'login-1', success: true, error: null });
  await until('signed in', () => w.sub().state === 'signed_in');
  assert.deepEqual([w.sub().model, shown().quota, shown().model, shown().login], ['b', 'Usage limits: 5 h 12% used.', true, false]);
  assert.equal(shown().state, 'Signed in with ChatGPT (Pro), as the official Codex app server reports. That does not show that a model will answer.');
  // The model is the user's choice among those that take pictures.
  w.press('lc:sub-model', 't');
  assert.equal(w.sub().model, 'b', 'a model that does not take pictures cannot be chosen');
  w.press('lc:sub-model', 'a');
  assert.equal(w.sub().model, 'a');
  // From the overlay, none of these presses count.
  w.h.handlers['lc:sub-model']!({ sender: w.s.overlay.webContents }, 'b');
  assert.equal(w.sub().model, 'a');
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

test('[synthetic connector] signed in and ready: capturing, writing, erasing, undo, redo, retained frames and selecting still send nothing but the account read', async () => {
  const w = await app();
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
  await w.select();
  assert.match(w.page.hint() ?? '', /^Clicks go to your apps\./, 'NAV, the mode before, is back at once; the card stays');
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(w.fakes.made.length === 1 && w.fakes.last().calls.map((c) => c.method), ['connection/read'], 'only the user\'s own Check reached the connector');
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
  w.page.press('ASK');
  w.page.pointer('pointerdown', 2, 190, 95);
  for (const [px, py] of [[400, 95], [400, 125], [190, 125]] as const) w.page.pointer('pointermove', 2, px, py);
  w.page.pointer('pointerup', 2, 192, 97);
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
});

test('[synthetic connector] the frame is replaced and its bitmap closed while the selection\'s picture is encoded: the selection is kept, with the same pixels, frame facts and ink', async () => {
  const w = await app();
  w.page.pointer('pointerdown', 1, 200, 105);
  for (const x of [240, 280]) w.page.pointer('pointermove', 1, x, 105);
  w.page.pointer('pointerup', 1, 280, 105);
  await w.page.review.pending();
  // The frame the selections are made from: a bitmap this test holds, so it can see when the app closes it.
  const bitmap = { width: 1280, height: 800, shade: 20, close() { this.width = this.height = 0; } };
  w.page.review.frame({ bitmap, seq: 41, at: '2026-09-30T12:00:05.000Z', presented: 41, presentedAt: performance.now() });
  const byId = (): Map<unknown, ReturnType<typeof w.records>[number]> => new Map(w.records().map((r) => [r['selection_id'], r]));
  // Control: nothing happens while the picture is encoded.
  await w.select();
  const [control] = [...byId().values()];
  assert.deepEqual([control!.context.frame_seq, control!.context.frame_captured_at, control!.context.frame_width, control!.context.frame_height], [41, '2026-09-30T12:00:05.000Z', 1280, 800]);
  // The same gesture; while its picture is encoded the screen changes, and the sampler takes the next frame and
  // closes this one (a closed bitmap's size reads as 0).
  let release!: () => void;
  w.page.encoding.gate = new Promise<void>((r) => (release = r));
  w.page.press('ASK');
  w.page.pointer('pointerdown', 2, 190, 95);
  for (const [px, py] of [[400, 95], [400, 125], [190, 125]] as const) w.page.pointer('pointermove', 2, px, py);
  w.page.pointer('pointerup', 2, 192, 97);
  await settle();
  w.page.scene.shade = 90;
  void w.page.review.sample();
  await until('the app\'s own sampler closed the frame', () => bitmap.width === 0 && bitmap.height === 0);
  w.page.encoding.gate = null;
  release();
  await until('the second selection is kept', () => byId().size === 2 && w.page.ask().form);
  const held = [...byId().values()].find((r) => r['selection_id'] !== control!['selection_id'])!;
  assert.equal(w.page.ask().status, null, 'not refused as malformed');
  assert.deepEqual(held.context, control!.context, 'the frame it was made from: its number, time and size, the region in its pixels, and the ink');
  assert.deepEqual([held.image.sha256, held.ink_original.sha256], [control!.image.sha256, control!.ink_original.sha256], 'the same pixels and the same ink document, although the screen shows something else now');
  assert.match(w.page.review.card()!.text, / px of frame 41 \(captured /);
  // It can be asked about, and what is sent is that picture.
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  const sent = (w.fakes.last().asks()[0]!.params as { request: AskRequest }).request;
  assert.deepEqual([sent.image.sha256, sent.context.frame_seq, sent.context.frame_width, sent.context.frame_height], [control!.image.sha256, 41, 1280, 800]);
  w.fakes.last().answer('ok');
  await until('answered', () => w.page.ask().answer !== null);
  // A selection after that is made from the new frame: another number, other pixels.
  await w.page.review.pending();
  await w.select(600, 120);
  const later = [...byId().values()].find((r) => r['selection_id'] !== control!['selection_id'] && r['selection_id'] !== held['selection_id'])!;
  assert.notEqual(later.context.frame_seq, 41);
  assert.deepEqual([later.context.frame_width, later.context.frame_height], [1280, 800]);
});

test('[synthetic connector] a question holding half of a surrogate pair is not sent and not recorded as asked; the connector is untouched; valid text of any script is sent as typed', async () => {
  const w = await app();
  await w.select();
  w.page.question('What is \ud83d this?');
  w.page.click('askSubmit');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, 'Not sent: the question holds a damaged character (half of a pair), so it cannot be sent as it is; type that part again.');
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([w.fakes.last().asks().length, w.records()[0]!.requests, w.sub().state, w.fakes.made.length, w.fakes.last().exited], [0, [], 'signed_in', 1, false]);
  // The same card can still ask, in any valid text.
  const question = '这个 😀 是什么? é \u{1F9EE}';
  w.page.question(`  ${question}  `);
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  assert.equal((w.fakes.last().asks()[0]!.params as { request: AskRequest }).request.question, question);
  assert.equal(w.records()[0]!.requests[0]!['question'], question);
  w.fakes.last().answer('ok');
  await until('answered', () => w.page.ask().answer !== null);
});

test('[synthetic connector] an answer whose overlay is lost before it reports what it did is recorded as presentation unconfirmed: its text is kept, and it is not counted as shown', async () => {
  const w = await app();
  const entry = (): Record<string, unknown> => w.records()[0]!.requests.at(-1)!;
  await w.select();
  // An answer the overlay reports as shown.
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  assert.deepEqual([entry()['shown'], 'presentation' in entry()], [false, false], 'nothing to present yet');
  w.fakes.last().answer('Seen on the card.');
  await until('shown and reported', () => entry()['shown'] === true);
  assert.deepEqual([entry()['presentation'], w.page.ask().answer], ['shown', 'Seen on the card.']);
  // A refusal has nothing to present.
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  w.fakes.last().fail(w.fakes.last().asks()[1]!.id, 'quota');
  await until('refused', () => /^No answer/.test(w.page.ask().status ?? ''));
  assert.deepEqual([entry()['shown'], 'presentation' in entry()], [false, false]);
  // An answer is on its way to the overlay (the overlay has not reported anything) when the overlay is lost.
  const release = w.page.holdSubmitAck();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 3);
  w.fakes.last().answer('TEXT WHOSE PRESENTATION NOBODY REPORTED');
  await until('recorded', () => entry()['outcome'] !== null);
  assert.deepEqual([entry()['shown'], entry()['presentation']], [false, 'unconfirmed'], 'from the moment it is sent to the overlay');
  w.s.overlay.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  await until('the session ended', () => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended != null, 5000);
  release();
  await settle();
  const last = entry();
  assert.deepEqual([(last['outcome'] as { status: string }).status, (last['outcome'] as { answer: { text: string } }).answer.text, last['shown'], last['presentation']], ['answered', 'TEXT WHOSE PRESENTATION NOBODY REPORTED', false, 'unconfirmed'], 'no report is not proof it was not seen: kept, and not counted as shown');
  // The earlier entries are as they were.
  assert.deepEqual(w.records()[0]!.requests.map((x) => [(x['outcome'] as { status: string }).status, x['shown'], x['presentation'] ?? null]), [['answered', true, 'shown'], ['refused', false, null], ['answered', false, 'unconfirmed']]);
});

test('[synthetic connector] the main process works the pixels out itself: a region off whole pixels is floored and ceiled, and a picture of another size is refused', async () => {
  const w = await app();
  const from = { sender: w.s.overlay.webContents };
  const session = (w.s as unknown as { doc: { id: string } }).doc.id;
  const facts = { region_dip: { x: 10.4, y: 10.6, width: 20.2, height: 10.1 }, frame_seq: 1, frame_captured_at: '2026-09-30T12:00:00.000Z', frame_width: 1280, frame_height: 800, ink_session: session, ink_revision: 0, visible_strokes: 0 };
  const { png } = await import('./png.ts');
  const ink = new TextEncoder().encode(JSON.stringify(w.page.review.state().doc));
  const send = async (width: number, height: number) => plain(await w.h.handlers['lc:ask-selection']!(from, facts, Uint8Array.from(png(width, height, 20)), ink)) as { ok: boolean; reason?: string };
  assert.deepEqual(await send(20, 10), { ok: false, reason: 'the selection\'s picture is a 20×10 PNG for a 21×11 frame' });
  assert.equal((await send(21, 11)).ok, true);
  assert.deepEqual(w.records().at(-1)!.context.region_px, { x: 10, y: 10, width: 21, height: 11 }, 'floor of the left and top, ceiling of the right and bottom');
  assert.deepEqual(w.records().at(-1)!.context.region_dip, facts.region_dip);
});

test('[synthetic connector] what cannot be written is not asked: a selection that could not be kept, and a question whose record could not be written', async () => {
  const w = await app();
  w.h.failWrites.on = true;
  await w.select();
  assert.match(w.page.ask().status ?? '', /^This selection cannot be asked about: the selection could not be written to this device \(.*\)\. It was not sent to any AI\.$/);
  assert.equal(w.page.ask().form, false);
  w.h.failWrites.on = false;
  await w.select(600, 120);
  const id = w.records().at(-1)!['selection_id'] as string;
  w.h.failWrites.on = true;
  w.page.click('askSubmit');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.match(w.page.ask().status ?? '', /^Not sent: the question could not be written to this device \(.*\), so it was not sent\.$/);
  // Nothing was asked, so nothing of a question is left unwritten: the session's end does not say there is.
  w.page.click('close');
  w.h.end('stopped by the test');
  const ended = (): string | null => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended ?? null;
  await until('ended', () => ended() !== null, 5000);
  assert.equal(ended(), 'stopped by the test');
  w.h.failWrites.on = false;
  assert.equal(w.fakes.last().asks().length, 0, 'nothing was sent');
  assert.deepEqual(w.records().find((r) => r['selection_id'] === id)!.requests, [], 'and no request is recorded as made');
});

test('[synthetic connector] closing the card, or a selection that selects nothing, cancels the question that is out; its late answer is neither shown nor kept', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  await w.select();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.page.click('close');
  await until('cancelled', () => w.fakes.last().count('ask/cancel') === 1);
  w.fakes.last().answer('A late answer after the card was closed.');
  await until('ended', () => w.sub().asking === false);
  assert.deepEqual([w.page.review.card(), JSON.stringify(w.records()).includes('late answer')], [null, false]);
  assert.deepEqual(plain(await w.h.handlers['lc:ask-submit']!({ sender: w.s.overlay.webContents }, w.records()[0]!['selection_id'], 'again?', 'hint')), { ok: false, reason: 'this is no longer the current selection' });
  // A new selection that selects nothing replaces the card too.
  await w.select(600, 120);
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  w.page.press('ASK'); // a circle outside the captured display selects nothing
  w.page.pointer('pointerdown', 2, 5000, 5000);
  w.page.pointer('pointermove', 2, 5100, 5100);
  w.page.pointer('pointerup', 2, 5000, 5001);
  await until('the empty card', () => /nothing was selected/.test(w.page.review.card()?.text ?? ''));
  await until('the question before is cancelled', () => w.fakes.last().count('ask/cancel') === 2);
  w.fakes.last().answer('A late answer after a new, empty selection.');
  await until('ended', () => w.sub().asking === false);
  assert.deepEqual([w.page.ask().form, w.page.ask().answer, JSON.stringify(w.records()).includes('empty selection')], [false, null, false]);
});

test('[synthetic connector] the help chosen is per selection, and Cancel pressed as the answer arrives still shows no answer', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  await w.select();
  w.page.choose('full_solution');
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  assert.equal((w.fakes.last().asks()[0]!.params as { request: AskRequest }).request.assistance, 'full_solution');
  await until('acknowledged', () => /^Asked at/.test(w.page.ask().status ?? ''));
  // Cancel is pressed while an answer is already on its way from the main process to the overlay.
  const selection = w.records()[0]!['selection_id'];
  const request = (w.fakes.last().asks()[0]!.params as { request: AskRequest }).request.request_id;
  w.page.click('askCancel');
  w.s.overlay.webContents.send('lc:ask-result', selection, request, { status: 'answered', answer: { text: 'An answer that crosses the Cancel.', model: 'vision-model', latency_ms: 5 } }, { saved: true, reason: null });
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([w.page.ask().answer, w.page.ask().status], [null, 'Cancelled: no answer is shown. Whether ChatGPT stopped working on it is not confirmed; it may still have counted against your usage.'], 'said it would not be shown, and it is not');
  w.fakes.last().fail(w.fakes.last().asks()[0]!.id, 'cancelled');
  await until('ended', () => w.sub().asking === false);
  // The next selection starts at "a hint" again.
  await w.select(600, 120);
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  assert.equal((w.fakes.last().asks()[1]!.params as { request: AskRequest }).request.assistance, 'hint');
});

test('[synthetic connector] how a question ended, said before the overlay has the submit\'s acknowledgement, is still shown: an answer, a refusal and a cancel; a result for another request is not', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const entries = (): Array<Record<string, unknown>> => w.records().at(-1)!.requests;
  const idOf = (i: number): string => (w.fakes.last().asks()[i]!.params as { request: AskRequest }).request.request_id;
  // An immediate refusal (the connector says ChatGPT is not signed in at once).
  await w.select();
  let release = w.page.holdSubmitAck();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.fakes.last().fail(w.fakes.last().asks()[0]!.id, 'unauthenticated');
  await until('recorded by the main process', () => entries()[0]!['outcome'] !== null);
  await settle();
  assert.equal(w.page.ask().status, 'Sending this picture and your question to ChatGPT…', 'not acknowledged yet');
  release();
  await until('shown', () => /^No answer/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().badge, w.page.ask().submit, w.page.ask().cancel], ['No answer: ChatGPT is not signed in (sign in from the control window). It was not sent again.', 'Selection · asked: no answer shown', true, false]);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(/Waiting for the answer/.test(w.page.ask().status ?? ''), false, 'never left waiting');
  assert.equal(w.sub().state, 'signed_out', 'as the connector said');
  w.press('lc:sub-check'); // the user checks again (the stand-in's account is signed in)
  await until('signed in', () => w.sub().state === 'signed_in');
  // An answer, with a result for another request of this selection in between: only this request's is shown.
  release = w.page.holdSubmitAck();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  const selection = w.records()[0]!['selection_id'];
  w.s.overlay.webContents.send('lc:ask-result', selection, `${String(selection)}.7`, { status: 'answered', answer: { text: 'For a request this card never made.', model: 'vision-model', latency_ms: 5 } }, { saved: true, reason: null });
  await settle();
  release();
  await until('acknowledged', () => /Waiting for the answer…$/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().answer, w.page.ask().cancel, w.page.ask().badge], [null, true, 'Selection · asked: being sent to ChatGPT'], 'the other request\'s answer is not accepted');
  assert.equal(idOf(1), `${String(selection)}.2`);
  w.fakes.last().answer('The answer to the question that was asked.');
  await until('answered', () => w.page.ask().answer !== null);
  assert.equal(w.page.ask().answer, 'The answer to the question that was asked.');
  assert.deepEqual(entries().map((x) => [(x['outcome'] as { status: string }).status, x['shown']]), [['refused', false], ['answered', true]]);
});

test('[synthetic connector] an answer said before the acknowledgement is shown once acknowledged and only then recorded as shown; a Cancel pressed before it shows none', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const entries = (): Array<Record<string, unknown>> => w.records().at(-1)!.requests;
  await w.select();
  let release = w.page.holdSubmitAck();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.fakes.last().answer('Answered before the acknowledgement.');
  await until('recorded', () => entries()[0]!['outcome'] !== null);
  await settle();
  assert.deepEqual([w.page.ask().answer, entries()[0]!['shown']], [null, false]);
  release();
  await until('shown', () => w.page.ask().answer !== null);
  await until('recorded as shown', () => entries()[0]!['shown'] === true);
  assert.deepEqual([w.page.ask().answer, w.page.ask().status, w.page.ask().badge, w.page.ask().save], ['Answered before the acknowledgement.', 'Answered by ChatGPT (vision-model) in 1.2 s, about the picture above and your question only.', 'Selection · answered by ChatGPT below', false]);
  // Cancel pressed while the submit is still unacknowledged; the cancelled outcome arrives before the acknowledgement.
  release = w.page.holdSubmitAck();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  w.page.click('askCancel');
  await until('the cancel is told', () => w.fakes.last().count('ask/cancel') === 1);
  w.fakes.last().fail(w.fakes.last().asks()[1]!.id, 'cancelled');
  await until('recorded', () => entries()[1]!['outcome'] !== null);
  await settle();
  release();
  await until('said', () => /^Cancelled: no answer is shown\./.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().answer, w.page.ask().submit, w.page.ask().cancel, w.page.ask().badge], [null, true, false, 'Selection · asked: no answer shown']);
  // An answer that had already left the main process when Cancel was pressed before the acknowledgement: not shown,
  // and the record says it was not (its text is not kept).
  release = w.page.holdSubmitAck();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 3);
  w.fakes.last().answer('An answer the user cancelled before seeing.');
  await until('recorded', () => entries()[2]!['outcome'] !== null);
  await settle();
  w.page.click('askCancel');
  release();
  await until('said', () => /^Cancelled: no answer is shown\./.test(w.page.ask().status ?? ''));
  await until('the record follows', () => (entries()[2]!['outcome'] as { status: string }).status === 'cancelled');
  assert.deepEqual([w.page.ask().answer, entries()[2]!['shown'], entries()[2]!['outcome'], JSON.stringify(w.records()).includes('cancelled before seeing')], [null, false, { status: 'cancelled', uncertain: true }, false]);
  assert.equal('presentation' in entries()[2]!, false, 'the overlay itself said it did not show it');
  assert.equal(w.fakes.last().asks().length, 3, 'three presses, three sends');
  // The card is closed while an answer is still held back from it: it was never shown, and its text is not kept.
  release = w.page.holdSubmitAck();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 4);
  w.fakes.last().answer('An answer for a card that closed first.');
  await until('recorded', () => entries()[3]!['outcome'] !== null);
  await settle();
  w.page.click('close');
  release();
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([w.page.review.card(), entries()[3]!['shown'], entries()[3]!['outcome'], JSON.stringify(w.records()).includes('closed first')], [null, false, { status: 'cancelled', uncertain: true }, false]);
  assert.equal('presentation' in entries()[3]!, false, 'its card closed before the answer reached it (the overlay\'s messages come in order)');
});

test('[synthetic connector] an answer whose record cannot be written is said as NOT saved, kept in the app, and written by Save; it is recorded as shown only once the overlay showed it', async () => {
  const w = await app();
  await w.select();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  const png = fs.readFileSync(path.join(w.folder(), w.records()[0]!.image.file));
  w.h.failWrites.on = true;
  w.fakes.last().answer('SYNTHETIC assistance that must not vanish.');
  await until('shown', () => w.page.ask().answer !== null);
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, 'Answered by ChatGPT (vision-model) in 1.2 s, about the picture above and your question only. This is NOT saved on this device yet: it could not be written (Error: EIO: i/o error (injected)). It is kept in the app and tried again when this card closes; press Save to try now.');
  assert.deepEqual([w.page.ask().answer, w.page.ask().save], ['SYNTHETIC assistance that must not vanish.', true]);
  assert.equal(w.records()[0]!.requests[0]!['outcome'], null, 'the device has the question, not yet how it ended');
  // Save while it still cannot be written: still said; nothing is asked again.
  w.page.click('askSave');
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([w.page.ask().save, /NOT saved/.test(w.page.ask().status ?? '')], [true, true]);
  w.h.failWrites.on = false;
  w.page.click('askSave');
  await until('saved', () => !w.page.ask().save);
  assert.equal(w.page.ask().status, 'Answered by ChatGPT (vision-model) in 1.2 s, about the picture above and your question only.');
  const entry = w.records()[0]!.requests[0]!;
  assert.deepEqual([(entry['outcome'] as { status: string; answer: { text: string } }).status, (entry['outcome'] as { answer: { text: string } }).answer.text, entry['shown']], ['answered', 'SYNTHETIC assistance that must not vanish.', true]);
  assert.deepEqual([w.fakes.last().asks().length, fs.readFileSync(path.join(w.folder(), w.records()[0]!.image.file)).equals(png)], [1, true], 'asked once; the original picture is untouched');
  // A refusal whose record cannot be written is said the same way.
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  w.h.failWrites.on = true;
  w.fakes.last().fail(w.fakes.last().asks()[1]!.id, 'quota');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  assert.match(w.page.ask().status ?? '', /^No answer: the subscription's usage limit was reached\. It was not sent again\. This is NOT saved on this device yet: /);
  w.h.failWrites.on = false;
  w.page.click('askSave');
  await until('saved', () => !w.page.ask().save);
  assert.equal(w.page.ask().status, 'No answer: the subscription\'s usage limit was reached. It was not sent again.', 'the status of this outcome, not of the one before');
  assert.deepEqual(w.records()[0]!.requests.map((x) => (x['outcome'] as { status: string }).status), ['answered', 'refused']);
  // A refusal that is NOT saved, then the capture ends: the card goes on saying so, with Save.
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 3);
  w.h.failWrites.on = true;
  w.fakes.last().fail(w.fakes.last().asks()[2]!.id, 'quota');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  w.page.review.endCapture('the capture ended in this test');
  assert.deepEqual([/^No answer: .* This is NOT saved on this device yet: /.test(w.page.ask().status ?? ''), w.page.ask().save, w.page.ask().form], [true, true, false]);
  w.h.failWrites.on = false;
});

test('[synthetic connector] while an outcome is NOT saved, an Ask that is refused leaves the card saying so with Save and the answer; a late Save answer never replaces a newer question\'s status', async () => {
  const w = await app();
  const NOT_SAVED = 'NOT saved on this device yet: it could not be written (Error: EIO: i/o error (injected)). It is kept in the app and tried again when this card closes; press Save to try now.';
  await w.select();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.h.failWrites.on = true;
  w.fakes.last().answer('An answer the device has not written.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  // Ask again while it still cannot be written: refused, and the card still says what is not saved.
  w.page.click('askSubmit');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, `Not sent: the question could not be written to this device (Error: EIO: i/o error (injected)), so it was not sent. How the question before ended is ${NOT_SAVED}`);
  assert.deepEqual([w.page.ask().save, w.page.ask().answer, w.page.ask().submit], [true, 'An answer the device has not written.', true]);
  w.page.click('askSave'); // still cannot be written: said again, about the question before
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(w.page.ask().status, `Not sent: the question could not be written to this device (Error: EIO: i/o error (injected)), so it was not sent. How the question before ended is ${NOT_SAVED}`);
  assert.deepEqual([w.page.ask().save, w.page.ask().answer], [true, 'An answer the device has not written.']);
  // Refused for another reason, the device writable again: the same; nothing is written until Save (or the card's end).
  w.h.failWrites.on = false;
  w.page.question('   ');
  w.page.click('askSubmit');
  await until('refused', () => /^Not sent: the question is empty/.test(w.page.ask().status ?? ''));
  assert.equal(w.page.ask().status, `Not sent: the question is empty or too long. How the question before ended is ${NOT_SAVED}`);
  assert.deepEqual([w.page.ask().save, w.page.ask().answer, w.records()[0]!.requests[0]!['outcome']], [true, 'An answer the device has not written.', null]);
  // Save, and at once Ask (its acknowledgement held back): the Save's answer does not replace "Sending…".
  w.page.question('And now?');
  const release = w.page.holdSubmitAck();
  w.page.click('askSave');
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([w.page.ask().status, w.page.ask().save], ['Sending this picture and your question to ChatGPT…', false]);
  release();
  await until('acknowledged', () => /^Asked at/.test(w.page.ask().status ?? ''));
  assert.deepEqual(w.records()[0]!.requests.map((x) => [(x['outcome'] as { status: string } | null)?.status ?? null, x['shown']]), [['answered', true], [null, false]]);
  // That question is refused; nothing is unsaved now, so nothing says so.
  w.fakes.last().fail(w.fakes.last().asks()[1]!.id, 'quota');
  await until('refused', () => /^No answer/.test(w.page.ask().status ?? ''));
  w.page.question('');
  w.page.click('askSubmit');
  await until('refused', () => /^Not sent/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().save], ['Not sent: the question is empty or too long.', false]);
  assert.equal(w.fakes.last().asks().length, 2, 'two accepted presses, two sends');
});

test('[synthetic connector] an Ask refused while the outcome before is unwritten leaves it held as unwritten: Save then writes it; a Save answered while an Ask is out is still taken', async () => {
  const w = await app();
  await w.select();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.h.failWrites.on = true;
  w.fakes.last().answer('An answer the device has not written.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  w.page.click('askSubmit');
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  w.h.failWrites.on = false;
  w.page.click('askSave');
  await until('saved', () => !w.page.ask().save);
  const entry = w.records()[0]!.requests[0]!;
  assert.deepEqual([(entry['outcome'] as { status: string } | null)?.status ?? null, entry['shown'], w.records()[0]!.requests.length, w.fakes.last().asks().length], ['answered', true, 1, 1], 'really written, and nothing asked again');
  assert.equal(w.page.ask().status, 'Not sent: the question could not be written to this device (Error: EIO: i/o error (injected)), so it was not sent.');
  // Unwritten again; Save (it is written now) and at once an Ask that is refused: the Save's answer was taken, so
  // nothing is said to be unsaved.
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  w.h.failWrites.on = true;
  w.fakes.last().answer('A second answer.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  w.h.failWrites.on = false;
  w.page.question('   ');
  const release = w.page.holdSubmitAck();
  w.page.click('askSave');
  w.page.click('askSubmit');
  await settle();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(w.page.ask().status, 'Sending this picture and your question to ChatGPT…');
  release();
  await until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().save, w.page.ask().answer], ['Not sent: the question is empty or too long.', false, 'A second answer.']);
  assert.deepEqual(w.records()[0]!.requests.map((x) => [(x['outcome'] as { status: string }).status, x['shown']]), [['answered', true], ['answered', true]]);
});

test('[synthetic connector] what the overlay says it did with an answer is taken only from the overlay, for the current selection and that request, and once', async () => {
  const w = await app();
  await w.select();
  const id = w.records()[0]!['selection_id'] as string;
  const overlay = { sender: w.s.overlay.webContents };
  const release = w.page.holdSubmitAck();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  const request = `${id}.1`;
  w.fakes.last().answer('An answer not yet shown.');
  await until('recorded', () => w.records()[0]!.requests[0]!['outcome'] !== null);
  await settle();
  const before = JSON.stringify(w.records());
  assert.equal(w.records()[0]!.requests[0]!['shown'], false);
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
  await until('shown', () => w.records()[0]!.requests[0]!['shown'] === true);
  assert.deepEqual(plain(await w.h.handlers['lc:ask-presented']!(overlay, id, request, false)), { saved: true, reason: null });
  const entry = w.records()[0]!.requests[0]!;
  assert.deepEqual([(entry['outcome'] as { status: string; answer: { text: string } }).answer.text, entry['shown']], ['An answer not yet shown.', true]);
});

test('[synthetic connector] an outcome still unwritten when its card goes is written when it can be: at the card\'s end, at the session\'s end (said there if not), and at the next Start', async () => {
  const w = await app();
  const said = (): string | null => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended ?? null;
  await w.select();
  const folder = w.folder();
  const entry = (): Record<string, unknown> => (JSON.parse(fs.readFileSync(path.join(folder, 'asks', fs.readdirSync(path.join(folder, 'asks')).find((f) => f.endsWith('.json'))!), 'utf8')) as { requests: Array<Record<string, unknown>> }).requests[0]!;
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.h.failWrites.on = true;
  w.fakes.last().answer('Shown, and written late.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  // The card is closed while it still cannot be written, then the session is stopped while it still cannot.
  w.page.click('close');
  await settle();
  assert.equal(entry()['outcome'], null);
  w.h.end('stopped by the test');
  await until('ended', () => said() !== null, 5000);
  assert.match(said()!, /^stopped by the test\. How 1 question\(s\) to ChatGPT ended \(an answer included, if one was shown or may have been\) could not be written to this device \(Error: EIO: i\/o error \(injected\)\); the selections and their pictures are kept, without that outcome, and writing it is tried again at the next Start and when the app closes$/);
  assert.equal(entry()['outcome'], null);
  // The device can be written again: the next Start writes it, exactly as it was held.
  w.h.failWrites.on = false;
  await running(w.h);
  assert.deepEqual([(entry()['outcome'] as { status: string }).status, (entry()['outcome'] as { answer: { text: string } }).answer.text, entry()['shown']], ['answered', 'Shown, and written late.', true]);
  assert.equal(w.fakes.made.reduce((n, c) => n + c.asks().length, 0), 1, 'never asked again to repair the record');
});

test('[synthetic connector] an unwritten outcome is written at its card\'s end, or at the session\'s end, when the device can be written then: nothing is said, and nothing is asked again', async () => {
  for (const at of ['card', 'session'] as const) {
    const w = await app();
    const ended = (): string | null => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended ?? null;
    await w.select();
    w.page.click('askSubmit');
    await until('sent', () => w.fakes.last().asks().length === 1);
    w.h.failWrites.on = true;
    w.fakes.last().answer(`Written at the ${at}'s end.`);
    await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
    if (at === 'card') w.h.failWrites.on = false;
    w.page.click('close');
    await settle();
    const entry = (): Record<string, unknown> => w.records()[0]!.requests[0]!;
    if (at === 'card') {
      assert.deepEqual([(entry()['outcome'] as { status: string; answer: { text: string } }).answer.text, entry()['shown']], ['Written at the card\'s end.', true]);
    } else {
      assert.equal(entry()['outcome'], null);
      w.h.failWrites.on = false;
    }
    w.h.end('stopped by the test');
    await until('ended', () => ended() !== null, 5000);
    assert.equal(ended(), 'stopped by the test', 'nothing is left unwritten, so nothing says so');
    assert.deepEqual([(entry()['outcome'] as { status: string; answer: { text: string } }).answer.text, entry()['shown'], w.fakes.last().asks().length], [`Written at the ${at}'s end.`, true, 1]);
  }
});

test('[synthetic connector] an outcome that comes after its session ended and cannot be written is said where the session\'s end is said, counted with what is already held, and written at the next Start', async () => {
  const w = await app({ configure: (c) => void (c.onCancel = 'silent') });
  const ended = (): string | null => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended ?? null;
  const told = (): string | null => (plain(w.control.sent.filter((m) => m[0] === 'lc:session').at(-1)?.[1]) as { ended?: string | null } | undefined)?.ended ?? null;
  const folder = (): string => w.folder();
  const all = (): Array<{ selection_id: string; requests: Array<Record<string, unknown>> }> => w.records() as never;
  // A first selection whose answer is shown but cannot be written; a second selection then replaces its card.
  await w.select();
  const first = all()[0]!.selection_id;
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.h.failWrites.only = `${first}.json`;
  w.fakes.last().answer('Shown on the first card.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  await w.select(600, 120);
  const dir = folder();
  const entryOf = (id: string): Record<string, unknown> => (JSON.parse(fs.readFileSync(path.join(dir, 'asks', `${id}.json`), 'utf8')) as { requests: Array<Record<string, unknown>> }).requests[0]!;
  const second = all().map((r) => r.selection_id).find((id) => id !== first)!;
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 2);
  w.h.end('stopped by the test');
  await until('ended', () => ended() !== null, 5000);
  assert.match(ended()!, /^stopped by the test\. How 1 question\(s\) to ChatGPT ended /, 'the first, held since its card was replaced');
  assert.equal(w.sub().asking, true, 'the second question is still out');
  // The second question ends after the session, and cannot be written either.
  w.h.failWrites.only = null;
  w.h.failWrites.on = true;
  w.fakes.last().answer('An answer after the Stop.');
  await until('the question ended', () => w.sub().asking === false);
  assert.deepEqual([entryOf(first)['outcome'], entryOf(second)['outcome']], [null, null]);
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
  assert.deepEqual([entryOf(first)['outcome'], entryOf(second)['outcome']], [null, null]);
  // The device can be written again: the next Start writes both, as they were held.
  w.h.failWrites.on = false;
  await running(w.h);
  assert.deepEqual([(entryOf(first)['outcome'] as { answer: { text: string } }).answer.text, entryOf(first)['shown']], ['Shown on the first card.', true]);
  assert.deepEqual([entryOf(second)['outcome'], entryOf(second)['shown'], JSON.stringify(entryOf(second)).includes('after the Stop')], [{ status: 'cancelled', uncertain: true }, false, false], 'never shown, its text not kept');
  assert.equal(w.fakes.made.reduce((n, c) => n + c.asks().length, 0), 2, 'two presses, two sends');
  // The pictures on this device are as they were.
  for (const r of all()) assert.equal(sha(fs.readFileSync(path.join(dir, (r as unknown as { image: { file: string } }).image.file))), (r as unknown as { image: { sha256: string } }).image.sha256);
});

test('[synthetic connector] an outcome that stays unwritten is said again at every later session\'s end (not in that session\'s manifest), holds the app\'s close once, and is tried as Windows ends the session and as the app quits', async () => {
  const w = await app();
  const ended = (): string | null => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended ?? null;
  const NOTICE = /^stopped by the test\. How 1 question\(s\) to ChatGPT ended .* and writing it is tried again at the next Start and when the app closes$/;
  await w.select();
  const folder = w.folder();
  const entry = (): Record<string, unknown> => (JSON.parse(fs.readFileSync(path.join(folder, 'asks', fs.readdirSync(path.join(folder, 'asks')).find((f) => f.endsWith('.json'))!), 'utf8')) as { requests: Array<Record<string, unknown>> }).requests[0]!;
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  w.h.failWrites.on = true;
  w.fakes.last().answer('Shown, and still unwritten.');
  await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
  w.h.end('stopped by the test');
  await until('ended', () => ended() !== null, 5000);
  assert.match(ended()!, NOTICE);
  // A new session while that record still cannot be written: tried at the Start, and its end says it again.
  w.h.failWrites.on = false;
  w.h.failWrites.only = `${path.sep}asks${path.sep}`;
  const next = async () => overlayPage(w.h, await running(w.h), { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  const page = await next();
  assert.deepEqual([ended(), entry()['outcome']], [null, null], 'tried at the Start, and still unwritten');
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
  (w.control as unknown as FakeWindow).emit('close', { preventDefault: () => (prevented = true) });
  await until('ended by the close', () => ended() !== null, 5000);
  await settle();
  assert.deepEqual([prevented, w.h.quits.n], [true, 0]);
  assert.match(ended()!, /^the app was closed\. How 1 question\(s\) to ChatGPT ended /);
  // The next close is not held.
  prevented = false;
  (w.control as unknown as FakeWindow).emit('close', { preventDefault: () => (prevented = true) });
  assert.equal(prevented, false);
  // Windows ending the user's session (no quit event then): tried, still unwritten; then written once it can be.
  (w.control as unknown as FakeWindow).emit('session-end');
  assert.equal(entry()['outcome'], null);
  w.h.failWrites.only = null;
  (w.control as unknown as FakeWindow).emit('query-session-end', { preventDefault: () => undefined });
  assert.deepEqual([(entry()['outcome'] as { status: string; answer: { text: string } }).answer.text, entry()['shown']], ['Shown, and still unwritten.', true]);
  assert.equal(w.fakes.made.reduce((n, c) => n + c.asks().length, 0), 1, 'never asked again');
});

test('[synthetic connector] a record held unwritten is tried a last time as the app quits, and as Windows ends the session', async () => {
  for (const by of ['before-quit', 'session-end'] as const) {
    const w = await app();
    await w.select();
    const entry = (): Record<string, unknown> => w.records()[0]!.requests[0]!;
    w.page.click('askSubmit');
    await until('sent', () => w.fakes.last().asks().length === 1);
    w.h.failWrites.on = true;
    w.fakes.last().answer(`Written at ${by}.`);
    await until('said', () => /NOT saved/.test(w.page.ask().status ?? ''));
    w.h.end('stopped by the test');
    await until('ended', () => (plain(w.press('lc:session-state')) as { ended?: string | null }).ended != null, 5000);
    assert.equal(entry()['outcome'], null);
    w.h.failWrites.on = false;
    if (by === 'before-quit') w.h.app.emit('before-quit');
    else (w.control as unknown as FakeWindow).emit('session-end');
    assert.deepEqual([(entry()['outcome'] as { answer: { text: string } }).answer.text, entry()['shown'], w.fakes.last().asks().length], [`Written at ${by}.`, true, 1]);
  }
});

test('[synthetic connector] a question the connector ends as cancelled by itself is said and recorded as not confirmed to have stopped, and is not sent again', async () => {
  const w = await app();
  await w.select();
  w.page.click('askSubmit');
  await until('sent', () => w.fakes.last().asks().length === 1);
  await until('acknowledged', () => /^Asked at/.test(w.page.ask().status ?? ''));
  w.fakes.last().fail(w.fakes.last().asks()[0]!.id, 'cancelled'); // the user pressed nothing
  await until('said', () => /^Cancelled/.test(w.page.ask().status ?? ''));
  assert.deepEqual([w.page.ask().status, w.page.ask().answer, w.page.ask().submit], ['Cancelled: no answer is shown. Whether ChatGPT stopped working on it is not confirmed; it may still have counted against your usage.', null, true]);
  assert.deepEqual(w.records()[0]!.requests.map((x) => [x['outcome'], x['shown']]), [[{ status: 'cancelled', uncertain: true }, false]]);
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual([w.fakes.last().asks().length, w.fakes.last().count('ask/cancel'), w.fakes.made.length, w.sub().state], [1, 0, 1, 'signed_in'], 'one send, no cancel of this app, one connector');
});

test('[synthetic connector] every new request is taken only from its own window', async () => {
  const w = await app();
  await w.select();
  const id = w.records()[0]!['selection_id'];
  const overlay = { sender: w.s.overlay.webContents };
  const control = { sender: w.control.webContents };
  const stranger = { sender: {} };
  // The overlay's requests, from the control window or anything else.
  for (const from of [control, stranger]) {
    assert.deepEqual(plain(await w.h.handlers['lc:ask-selection']!(from, {}, new Uint8Array(1), null)), { ok: false, reason: 'refused' });
    assert.deepEqual(plain(await w.h.handlers['lc:ask-submit']!(from, id, 'q', 'hint')), { ok: false, reason: 'refused' });
    w.h.handlers['lc:ask-cancel']!(from, id);
    w.h.handlers['lc:ask-closed']!(from);
  }
  w.page.click('askSubmit');
  await until('still the current selection, and asked', () => w.fakes.last().asks().length === 1);
  // The control window's presses, from the overlay or anything else.
  const before = w.fakes.last().calls.length;
  for (const from of [overlay, stranger]) {
    assert.equal(plain(await w.h.handlers['lc:sub-state']!(from)), null);
    for (const channel of ['lc:sub-check', 'lc:sub-login', 'lc:sub-login-cancel']) w.h.handlers[channel]!(from);
    w.h.handlers['lc:sub-model']!(from, 'text-only-model');
  }
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([w.fakes.last().calls.length, w.h.opened, w.sub().model], [before, [], 'vision-model']);
  w.fakes.last().answer('ok');
  await until('answered', () => w.page.ask().answer !== null);
});

test('a connector configuration that cannot be used keeps the subscription off, and says so; the app is otherwise as before', async () => {
  const h = harness({ env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig({}, { kind: 'posix', python: '/p', cwd: '/b' }) } });
  const s = await running(h);
  const status = plain(h.handlers['lc:sub-state']!({ sender: (h.control() as unknown as FakeWindow).webContents }));
  assert.deepEqual(status, { mode: 'unavailable', reason: 'the subscription connector configuration is not valid' });
  const p = controlPage();
  p.showSubscription(status);
  assert.deepEqual([p.nodes['subState']!.textContent, p.nodes['ai']!.textContent, p.nodes['subCheck']!.hidden], ['ChatGPT subscription: off. the subscription connector configuration is not valid.', 'No AI is connected: captured frames and ink stay on this device, and nothing is sent anywhere.', true]);
  assert.equal((plain(await h.handlers['lc:overlay-ready']!({ sender: s.overlay.webContents })) as { subscription: boolean }).subscription, false);
});
