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
import { harness, plain, quitLinks, running, settle, type FakeWindow } from './main-harness.ts';
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
  w.s.overlay.webContents.send('lc:ask-result', selection, request, { status: 'answered', answer: { text: 'An answer that crosses the Cancel.', model: 'vision-model', latency_ms: 5 } });
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
