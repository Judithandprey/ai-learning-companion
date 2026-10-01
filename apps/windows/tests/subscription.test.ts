// The managed ChatGPT subscription from this app's side (src/main/subscription.ts, src/shared/subscription-ask.ts):
// the trusted configuration, the envelope's lines, the sign-in, one question at a time, cancellation, a stopped
// session, and the child's lifetime. SYNTHETIC: the connector is a stand-in (tests/subscription-fakes.ts, and a small
// real child process for the pipes); no Codex, no ChatGPT, no sign-in and no network are involved. Every test here
// is synthetic: an "answer" is text the test wrote.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { CONNECTOR_END_MS, readConnectorConfig, Subscription, type AskOutcome, type ConnectorConfig, type SubscriptionStatus } from '../src/main/subscription.ts';
import { ANSWER_MAX, contextProblem, officialLoginUrl, provenanceOf, questionOf, questionProblem, readAccount, readAnswer, type AskRequest } from '../src/shared/subscription-ask.ts';
import { ACCOUNT, fakeConnectors, LOGIN_URL, type FakeConnector } from './subscription-fakes.ts';

const made: Subscription[] = [];
after(async () => void (await Promise.all(made.map((s) => s.quit()))));
const until = async (what: string, ok: () => boolean, ms = 5000): Promise<void> => {
  const by = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > by) assert.fail(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};
const await_emitter = (): typeof EventEmitter => EventEmitter;
const WSL: ConnectorConfig = { launch: { kind: 'wsl', distribution: 'Ubuntu', user: 'someone', cd: '/backend', python: '/backend/.venv/bin/python' }, state_dir: null, codex_bin: null };
function subscription(config: ConnectorConfig = WSL, extra: object = {}, configure?: Parameters<typeof fakeConnectors>[0]) {
  const fakes = fakeConnectors(configure);
  const said: SubscriptionStatus[] = [];
  const opened: string[] = [];
  const s = new Subscription({ config, notify: (x) => said.push(x), openExternal: (url) => void opened.push(url), spawn: fakes.spawn, request_ms: 300, ask_ms: 400, end_ms: 200, ...extra });
  made.push(s);
  const now = () => s.status() as Extract<SubscriptionStatus, { mode: 'managed' }>;
  return { s, fakes, said, opened, now };
}
const request = (o: Partial<AskRequest> = {}): AskRequest => ({
  request_id: 'ask-0123456789abcdef.1',
  question: 'What is this?',
  assistance: 'hint',
  image: { png_base64: 'iVBORw0KGgo=', sha256: 'a'.repeat(64), width: 40, height: 20 },
  context: {
    capture_session_id: '0123456789abcdef', frame_seq: 7, frame_captured_at: '2026-10-01T05:00:00.000Z', frame_width: 2560, frame_height: 1600,
    display: { id: '1', bounds: { x: -1280, y: 0, width: 1280, height: 800 }, scale_factor: 2 },
    region_dip: { x: 10, y: 10, width: 20, height: 10 }, region_px: { x: 20, y: 20, width: 40, height: 20 },
    ink_revision: 3, ink_sha256: 'b'.repeat(64), source_url: null, source_version: null, media_position: null,
  },
  ...o,
});

// ---- the pure rules ---------------------------------------------------------------------------------------------
test('the question is trimmed; an empty or over-long one is refused', () => {
  assert.equal(questionOf('  why?  '), 'why?');
  for (const bad of ['', '   ', 'x'.repeat(4001), 7, null]) assert.equal(questionOf(bad), null);
  assert.equal(questionOf('x'.repeat(4000))?.length, 4000);
});

test('a question holding half of a surrogate pair is refused, whichever half and wherever; every valid text is kept as it is', () => {
  const DAMAGED = 'the question holds a damaged character (half of a pair), so it cannot be sent as it is; type that part again';
  for (const bad of ['What is \ud83d this?', 'What is \ude00 this?', '\ud83d', 'end \ud83d', '\ude00 start', 'swapped \ude00\ud83d pair', 'two \ud83d\ud83d\ude00 highs']) {
    assert.equal(questionOf(bad), null, JSON.stringify(bad));
    assert.equal(questionProblem(bad), DAMAGED);
  }
  // Valid Unicode stays: astral characters, combining marks, other scripts, a pair at either end.
  for (const good of ['What is 😀 this?', '😀', '这道题怎么做？', 'e\u0301 and \u{1F9EE} and \u{10FFFF}', '😀 start and end 😀', 'x'.repeat(3998) + '😀']) assert.equal(questionOf(`  ${good}  `), good);
  for (const other of ['', '   ', 'x'.repeat(4001), 7]) assert.equal(questionProblem(other), 'the question is empty or too long');
  assert.equal(questionProblem('  \ud83d  '), DAMAGED, 'as it is sent: trimmed first');
});

test('a selection\'s rectangles must be finite, positive and inside the display and the frame; the picture is the region\'s size', () => {
  const c = request().context;
  const image = { width: 40, height: 20 };
  assert.equal(contextProblem(c, image), null, 'a display at a negative desktop origin is fine: the region is display-local');
  assert.match(contextProblem({ ...c, region_dip: { x: 1270, y: 10, width: 20, height: 10 } }, image)!, /not inside the display/);
  assert.match(contextProblem({ ...c, region_dip: { x: 10, y: 10, width: 0, height: 10 } }, image)!, /not inside the display/);
  assert.match(contextProblem({ ...c, region_px: { x: 2540, y: 20, width: 40, height: 20 } }, image)!, /not inside the frame/);
  assert.match(contextProblem({ ...c, region_px: { x: 20.5, y: 20, width: 40, height: 20 } }, image)!, /not inside the frame/);
  assert.match(contextProblem({ ...c, region_dip: { x: NaN, y: 10, width: 20, height: 10 } }, image)!, /not inside the display/);
  assert.match(contextProblem(c, { width: 41, height: 20 })!, /not the size of the selected region/);
  assert.match(contextProblem({ ...c, frame_width: 8000, frame_height: 4000, region_px: { x: 0, y: 0, width: 8000, height: 4000 } }, { width: 8000, height: 4000 })!, /more than 16000000 pixels/);
});

test('the account as read: only the managed ChatGPT mode is signed in; a missing picture capability is not assumed; another shape is nothing', () => {
  assert.deepEqual(readAccount(ACCOUNT), { state: 'signed_in', plan: 'Pro', rate_limits: [{ label: '5 h', used_percent: 12.4, resets_at: '2026-10-01T10:00:00Z' }], models: [{ id: 'text-only-model', label: 'Text only', image_input: false, default: true }, { id: 'vision-model', label: 'Vision', image_input: true, default: false }] });
  assert.equal(readAccount({ ...ACCOUNT, auth: { state: 'signed_in', mode: 'api_key', plan: null } })?.state, 'signed_out', 'an API key is not this subscription');
  assert.deepEqual(readAccount({ auth: { state: 'signed_in', mode: 'chatgpt', plan: null, email: 'someone@example.com', token: 'secret' }, rate_limits: null, models: [{ id: 'm', label: 'M' }] }), { state: 'signed_in', plan: null, rate_limits: null, models: [{ id: 'm', label: 'M', image_input: false, default: false }] }, 'nothing else of the answer is kept');
  for (const bad of [null, {}, { auth: { state: 'yes' }, models: [] }, { auth: { state: 'signed_in', mode: 'chatgpt' }, models: [{ label: 'no id' }] }, { auth: { state: 'signed_in', mode: 'chatgpt' }, models: [], rate_limits: [{ label: 'x' }] }]) assert.equal(readAccount(bad), null);
});

test('a sign-in address is opened only if it is https on openai.com or chatgpt.com (or a subdomain), with no user, password or port', () => {
  for (const ok of [LOGIN_URL, 'https://chatgpt.com/auth/login', 'https://openai.com/x']) assert.equal(officialLoginUrl(ok), new URL(ok).toString());
  for (const bad of ['http://auth.openai.com/x', 'https://auth.openai.com.evil.example/x', 'https://evilopenai.com/x', 'https://user:pw@auth.openai.com/x', 'https://auth.openai.com:8443/x', 'https://localhost/x', 'file:///c:/x', 'javascript:alert(1)', 'not a url', '', 7, `https://auth.openai.com/${'x'.repeat(5000)}`]) {
    assert.equal(officialLoginUrl(bad), null, String(bad).slice(0, 60));
  }
});

test('an answer is read only if its whole provenance is the request that was sent', () => {
  const sent = request();
  const good = { request_id: sent.request_id, text: 'It is a triangle.', provenance: provenanceOf(sent), model: 'vision-model', auth_mode: 'chatgpt', latency_ms: 900, thread_id: 't1', turn_id: 'u1' };
  assert.deepEqual(readAnswer(good, sent), { request_id: sent.request_id, text: 'It is a triangle.', model: 'vision-model', latency_ms: 900, thread_id: 't1', turn_id: 'u1' });
  // The same provenance in another member order is the same.
  assert.equal(typeof readAnswer({ ...good, provenance: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(provenanceOf(sent)).reverse()))) }, sent), 'object');
  const p = (change: (v: ReturnType<typeof provenanceOf> & { context: Record<string, unknown>; image: Record<string, unknown> }) => void) => {
    const v = JSON.parse(JSON.stringify(provenanceOf(sent)));
    change(v);
    return { ...good, provenance: v };
  };
  for (const [what, v] of [
    ['another request', { ...good, request_id: 'ask-other.1' }],
    ['another picture', p((x) => void (x.image['sha256'] = 'c'.repeat(64)))],
    ['another question', p((x) => void ((x as Record<string, unknown>)['question'] = 'What else?'))],
    ['more help than asked', p((x) => void ((x as Record<string, unknown>)['assistance'] = 'full_solution'))],
    ['another ink document', p((x) => void (x.context['ink_sha256'] = 'd'.repeat(64)))],
    ['another ink revision', p((x) => void (x.context['ink_revision'] = 4))],
    ['another frame', p((x) => void (x.context['frame_seq'] = 8))],
    ['another session', p((x) => void (x.context['capture_session_id'] = 'fedcba9876543210'))],
    ['a missing fact', p((x) => void delete x.context['media_position'])],
    ['an added fact', p((x) => void (x.context['extra'] = 1))],
    ...Object.keys(sent.context).map((k) => [`context.${k} changed`, p((x) => void (x.context[k] = typeof x.context[k] === 'number' ? (x.context[k] as number) + 1 : typeof x.context[k] === 'string' ? `${x.context[k] as string}x` : x.context[k] === null ? 0 : { changed: true }))] as const),
    ...['x', 'y', 'width', 'height'].flatMap((k) => (['region_dip', 'region_px'] as const).map((r) => [`${r}.${k} changed`, p((x) => void ((x.context[r] as Record<string, number>)[k]! += 1))] as const)),
    ['display.bounds changed', p((x) => void ((x.context['display'] as { bounds: { x: number } }).bounds.x += 1))],
    ['display.id changed', p((x) => void ((x.context['display'] as { id: string }).id = '2'))],
    ['display.scale_factor changed', p((x) => void ((x.context['display'] as { scale_factor: number }).scale_factor = 1))],
    ['image.width changed', p((x) => void (x.image['width'] = 41))],
    ['image.height changed', p((x) => void (x.image['height'] = 21))],
    ['no provenance', { ...good, provenance: null }],
    ['another auth mode', { ...good, auth_mode: 'api_key' }],
    ['no text', { ...good, text: '   ' }],
    ['too much text', { ...good, text: 'x'.repeat(ANSWER_MAX + 1) }],
    ['no model', { ...good, model: '' }],
    ['no turn', { ...good, turn_id: undefined }],
  ] as const) assert.equal(typeof readAnswer(v, sent), 'string', what);
});

test('the connector configuration: off unless named; launch facts and two trusted settings only', () => {
  assert.equal(readConnectorConfig({}), null);
  const read = (v: unknown) => () => JSON.stringify(v);
  const wsl = { format: 'lc-windows-subscription-connector/v1', launch: { kind: 'wsl', distribution: 'Ubuntu', user: 'someone', cd: '/backend', python: '/backend/.venv/bin/python' } };
  assert.deepEqual(readConnectorConfig({ LC_SUBSCRIPTION_CONNECTOR: 'c.json' }, read(wsl)), { launch: wsl.launch, state_dir: null, codex_bin: null });
  assert.deepEqual(readConnectorConfig({ LC_SUBSCRIPTION_CONNECTOR: 'c.json' }, read({ ...wsl, state_dir: '/state', codex_bin: '/bin/codex' })), { launch: wsl.launch, state_dir: '/state', codex_bin: '/bin/codex' });
  for (const bad of [{ ...wsl, format: 'x' }, { ...wsl, launch: { ...wsl.launch, kind: 'ssh' } }, { ...wsl, launch: { kind: 'posix', python: '/p', cwd: '/b' } }, { ...wsl, launch: { ...wsl.launch, python: 'a\nb' } }, { ...wsl, state_dir: 7 }, { ...wsl, codex_bin: '' }]) {
    assert.match(String((readConnectorConfig({ LC_SUBSCRIPTION_CONNECTOR: 'c.json' }, read(bad)) as { error?: string }).error), /not valid/);
  }
  assert.match(String((readConnectorConfig({ LC_SUBSCRIPTION_CONNECTOR: 'c.json' }, () => { throw new Error('missing'); }) as { error?: string }).error), /could not be read/);
});

// ---- the connector child (synthetic) ----------------------------------------------------------------------------
test('nothing is started until the user checks; the launch is exact, and only the two trusted settings reach the child', async () => {
  const saved = { ...process.env };
  Object.assign(process.env, { LC_SUBSCRIPTION_CONNECTOR: '/secret/config.json', LC_DEV_CAPTURE_HOST: '/x', LC_SUBSCRIPTION_STATE_DIR: '/inherited/not/trusted', WSLENV: 'SOMETHING/u', PGPASSWORD: 'x' });
  try {
    const { s, fakes, now } = subscription({ ...WSL, state_dir: '/product/state', codex_bin: '/opt/codex' });
    assert.deepEqual([now().state, fakes.made.length], ['not_checked', 0], 'no child before the user asks for one');
    await s.check();
    assert.equal(fakes.made.length, 1);
    const l = fakes.launches[0]!;
    assert.deepEqual([l.command, l.args], ['wsl.exe', ['--distribution', 'Ubuntu', '--user', 'someone', '--cd', '/backend', '--exec', '/backend/.venv/bin/python', '-m', 'services.worker.connectors.chatgpt_local']]);
    assert.deepEqual([l.env['LC_SUBSCRIPTION_STATE_DIR'], l.env['LC_SUBSCRIPTION_CODEX_BIN'], l.env['WSLENV']], ['/product/state', '/opt/codex', 'LC_SUBSCRIPTION_STATE_DIR/u:LC_SUBSCRIPTION_CODEX_BIN/u']);
    assert.deepEqual(Object.keys(l.env).filter((k) => /^(LC_|PG|PYTHON)/i.test(k)).sort(), ['LC_SUBSCRIPTION_CODEX_BIN', 'LC_SUBSCRIPTION_STATE_DIR', 'PYTHONDONTWRITEBYTECODE'], 'only the two trusted settings, from the configuration and not from this process\'s own environment');
    assert.deepEqual((l.options as { stdio: unknown }).stdio, ['pipe', 'pipe', 'ignore'], 'its error output is not read');
    assert.deepEqual(fakes.last().calls.map((c) => [c.method, c.params]), [['connection/read', {}]]);
    assert.deepEqual([now().state, now().plan, now().model, now().rate_limits?.length], ['signed_in', 'Pro', 'vision-model', 1], 'the model chosen is one that takes pictures, not the text-only default');
    // Without the two settings nothing is carried into WSL (an inherited WSLENV is dropped).
    const plain = subscription();
    await plain.s.check();
    assert.deepEqual([plain.fakes.launches[0]!.env['WSLENV'], plain.fakes.launches[0]!.env['LC_SUBSCRIPTION_STATE_DIR']], [undefined, undefined]);
  } finally {
    for (const k of ['LC_SUBSCRIPTION_CONNECTOR', 'LC_DEV_CAPTURE_HOST', 'LC_SUBSCRIPTION_STATE_DIR', 'WSLENV', 'PGPASSWORD']) if (!(k in saved)) delete process.env[k];
  }
});

test('the sign-in: its page is opened only on the user\'s press and only at an official address; completion, failure and cancel are said', async () => {
  const { s, fakes, opened, now } = subscription();
  await s.check();
  assert.deepEqual(opened, [], 'reading the state opens nothing');
  await s.login();
  assert.deepEqual([opened, now().login], [[LOGIN_URL], 'waiting']);
  assert.equal(JSON.stringify(now()).includes('auth.openai.com'), false, 'the address is not part of what the windows are told');
  // Another product's sign-in completing is not this one's.
  fakes.last().event('connection/login/completed', { login_id: 'someone-else', success: true, error: null });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(now().login, 'waiting');
  fakes.last().event('connection/login/completed', { login_id: 'login-1', success: true, error: null });
  await until('signed in, read again', () => now().login === 'none' && fakes.last().count('connection/read') === 2);
  // A failure is said, with the connector's bounded description.
  await s.login();
  fakes.last().event('connection/login/completed', { login_id: 'login-1', success: false, error: 'login_failed' });
  await until('failed', () => now().login === 'failed');
  assert.equal(now().detail, null, 'only the fixed state is said; nothing of the connector\'s wording');
  await s.login();
  fakes.last().event('connection/login/completed', { login_id: 'login-1', success: false, error: 'login_cancelled' });
  await until('cancelled elsewhere', () => now().login === 'cancelled');
  // Cancel: only this product's pending sign-in.
  await s.login();
  await s.cancelLogin();
  assert.deepEqual([now().login, fakes.last().calls.at(-1)], ['cancelled', { id: fakes.last().calls.at(-1)!.id, method: 'connection/login/cancel', params: { login_id: 'login-1' } }]);
  // An address that is not official is never opened, and that sign-in is cancelled.
  const before = opened.length;
  fakes.last().loginUrl = 'https://auth.openai.com.evil.example/authorize';
  await s.login();
  assert.deepEqual([opened.length, now().login, fakes.last().calls.at(-1)?.method], [before, 'refused_address', 'connection/login/cancel']);
});

test('one question: sent once in the envelope with the chosen model; its bound answer is returned; a second meanwhile is not sent', async () => {
  const { s, fakes, now } = subscription();
  await s.check();
  const sent = request();
  const done = s.ask(sent);
  await until('sent', () => fakes.last().asks().length === 1);
  assert.equal(now().asking, true);
  assert.deepEqual(fakes.last().asks()[0]!.params, { request: sent, model: 'vision-model' });
  const second = await s.ask(request({ request_id: 'ask-other.1' }));
  assert.deepEqual(second, { status: 'refused', code: 'local', reason: 'another question is still being answered' });
  assert.equal(fakes.last().asks().length, 1, 'the second was not sent');
  fakes.last().answer('It is a right triangle.');
  assert.deepEqual(await done, { status: 'answered', answer: { request_id: sent.request_id, text: 'It is a right triangle.', model: 'vision-model', latency_ms: 1234, thread_id: 'thread-synthetic-1', turn_id: 'turn-synthetic-1' } });
  assert.equal(now().asking, false);
});

test('an answer not bound to what was sent is not returned; the connector\'s errors are fixed texts, never its message; nothing is sent again', async () => {
  const { s, fakes } = subscription();
  await s.check();
  let done = s.ask(request());
  await until('sent', () => fakes.last().asks().length === 1);
  fakes.last().answer('An answer about another picture.', (r) => void ((r['provenance'] as { image: { sha256: string } }).image.sha256 = 'c'.repeat(64)));
  assert.deepEqual(await done, { status: 'refused', code: 'unbound', reason: 'the answer is not bound to the request that was sent; it is not shown' });
  for (const [code, reason] of [['quota', 'the subscription\'s usage limit was reached'], ['unsupported_model', 'the chosen model does not take pictures'], ['failed', 'ChatGPT did not complete an answer'], ['some_new_code', 'ChatGPT did not complete an answer']] as const) {
    const n = fakes.last().asks().length;
    done = s.ask(request({ request_id: `ask-x.${n}` }));
    await until('sent', () => fakes.last().asks().length === n + 1);
    fakes.last().fail(fakes.last().asks().at(-1)!.id, code);
    const outcome = await done;
    assert.deepEqual(outcome, { status: 'refused', code: code === 'some_new_code' ? 'failed' : code, reason });
    assert.equal(JSON.stringify(outcome).includes('raw message'), false);
    assert.equal(fakes.last().asks().length, n + 1, 'not sent again');
  }
  // Not signed in any more: said, and the state follows.
  const n = fakes.last().asks().length;
  done = s.ask(request({ request_id: 'ask-y.1' }));
  await until('sent', () => fakes.last().asks().length === n + 1);
  fakes.last().fail(fakes.last().asks().at(-1)!.id, 'unauthenticated');
  assert.equal((await done).status, 'refused');
  assert.equal((s.status() as { state: string }).state, 'signed_out');
  assert.deepEqual(await s.ask(request({ request_id: 'ask-z.1' })), { status: 'refused', code: 'local', reason: 'ChatGPT is not signed in (sign in from the control window)' });
  assert.equal(fakes.last().asks().length, n + 1, 'nothing is sent while signed out');
});

test('cancel: the turn is interrupted and its answer never returned, whatever arrives; whether it stopped is what the cancel was answered', async () => {
  for (const [mode, uncertain] of [['confirmed', false], ['unconfirmed', true]] as const) {
    const { s, fakes } = subscription();
    await s.check();
    fakes.last().onCancel = mode;
    const sent = request();
    const done = s.ask(sent);
    await until('sent', () => fakes.last().asks().length === 1);
    s.cancel(sent.request_id);
    // As the released connector answers: the question as `cancelled`; the uncertainty in the cancel's own answer.
    assert.deepEqual(await done, { status: 'cancelled', uncertain });
    assert.deepEqual(fakes.last().calls.at(-1), { id: fakes.last().calls.at(-1)!.id, method: 'ask/cancel', params: { request_id: sent.request_id } });
  }
  // The answer arrives although it was cancelled (the interruption raced it): it is not returned.
  const { s, fakes } = subscription();
  await s.check();
  fakes.last().onCancel = 'silent';
  const sent = request();
  const done = s.ask(sent);
  await until('sent', () => fakes.last().asks().length === 1);
  s.cancel(sent.request_id);
  fakes.last().answer('A late answer.');
  const outcome = await done;
  assert.deepEqual(outcome, { status: 'cancelled', uncertain: true });
  assert.equal(JSON.stringify(outcome).includes('late answer'), false);
  // A cancel that gets no answer at all (the connector hangs) is not a confirmed stop either.
  const hung = subscription();
  await hung.s.check();
  const asked = hung.s.ask(request());
  await until('sent', () => hung.fakes.last().asks().length === 1);
  hung.fakes.last().stdin.removeAllListeners('data'); // it reads nothing more
  hung.s.cancel(request().request_id);
  assert.deepEqual(await asked, { status: 'cancelled', uncertain: true });
});

test('a stopped capture session can never ask again: its question out is cancelled, the connector is told, and nothing of it is sent later', async () => {
  const { s, fakes } = subscription();
  await s.check();
  const sent = request();
  const done = s.ask(sent);
  await until('sent', () => fakes.last().asks().length === 1);
  fakes.last().onCancel = 'unconfirmed';
  s.stopSession(sent.context.capture_session_id);
  await until('told', () => fakes.last().count('session/stop') === 1);
  assert.deepEqual(fakes.last().calls.at(-1), { id: fakes.last().calls.at(-1)!.id, method: 'session/stop', params: { capture_session_id: sent.context.capture_session_id } });
  fakes.last().answer('An answer after the Stop.');
  assert.deepEqual(await done, { status: 'cancelled', uncertain: true }, 'not shown; the Stop\'s interruption was not confirmed, and that is said');
  assert.deepEqual(await s.ask(request({ request_id: 'ask-after.1' })), { status: 'refused', code: 'local', reason: 'this capture session was stopped' });
  assert.equal(fakes.last().asks().length, 1);
  // Another session, an explicit new Start, can ask.
  const other = request({ request_id: 'ask-new.1', context: { ...sent.context, capture_session_id: 'fedcba9876543210' } });
  const next = s.ask(other);
  await until('sent', () => fakes.last().asks().length === 2);
  fakes.last().answer('For the new session.');
  assert.equal((await next).status, 'answered');
  // A session stopped before any child ran starts none.
  const idle = subscription();
  idle.s.stopSession('0123456789abcdef');
  assert.equal(idle.fakes.made.length, 0);
});

test('no answer in time, or the connector lost: said as not known, the turn interrupted, and never sent again', async () => {
  const { s, fakes, now } = subscription();
  await s.check();
  fakes.last().onCancel = 'silent';
  const done = s.ask(request());
  await until('sent', () => fakes.last().asks().length === 1);
  assert.deepEqual(await done, { status: 'uncertain', reason: 'no answer came; whether ChatGPT worked on the question is not known' });
  assert.deepEqual([fakes.last().asks().length, fakes.last().calls.at(-1)?.method], [1, 'ask/cancel']);
  // The connector ends while a question is out.
  const lost = s.ask(request({ request_id: 'ask-lost.1' }));
  await until('sent', () => fakes.last().asks().length === 2);
  fakes.last().exit(1);
  assert.equal((await lost).status, 'uncertain');
  assert.equal(now().state, 'unavailable');
  assert.deepEqual(await s.ask(request({ request_id: 'ask-next.1' })), { status: 'refused', code: 'local', reason: 'the connector, or the official Codex app server it runs, is not available' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fakes.made.length, 1, 'no new connector is started by the app itself (not even to cancel what the lost one had)');
  // Only the user's own Check starts one again.
  await s.check();
  assert.deepEqual([fakes.made.length, now().state], [2, 'signed_in']);
  // A question given up while its connector had already gone: the same, no new child.
  const gone = subscription();
  await gone.s.check();
  const asked = gone.s.ask(request());
  await until('sent', () => gone.fakes.last().asks().length === 1);
  gone.fakes.last().exit(1);
  await asked;
  gone.s.cancel(request().request_id);
  gone.s.stopSession(request().context.capture_session_id);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(gone.fakes.made.length, 1);
});

test('a connector that cannot be started, answers in another form, or writes an over-long line is said as not available', async () => {
  const none = subscription(WSL, { spawn: (() => spawn(path.join('/nonexistent', `lc-no-connector-${process.pid}`), [], { stdio: ['pipe', 'pipe', 'ignore'] })) as never });
  await none.s.check();
  assert.deepEqual([none.now().state, none.now().detail], ['unavailable', 'the connector could not be started']);
  const odd = subscription(WSL, {}, (c) => void (c.account = { something: 'else' }));
  await odd.s.check();
  assert.deepEqual([odd.now().state, odd.now().detail], ['unavailable', 'the connector answered in a form this app does not read']);
  // A line over the bound: the child is ended; nothing of the line is kept.
  const long = subscription();
  await long.s.check();
  long.fakes.last().stdout.write(`{"method":"x","params":"${'y'.repeat(300 * 1024)}"}\n`);
  await until('ended', () => long.fakes.last().exited);
  assert.equal(long.now().state, 'unavailable');
});

test('lines are read whole whatever the chunks: split inside a character, several in one chunk, an answer for nothing, and not JSON', async () => {
  const { s, fakes, now } = subscription(WSL, {}, (c) => void (c.account = null)); // this test answers by hand
  const reading = s.check();
  await until('asked', () => fakes.made.length === 1 && fakes.last().count('connection/read') === 1);
  const id = fakes.last().calls[0]!.id;
  const account = { ...ACCOUNT, auth: { state: 'signed_in', mode: 'chatgpt', plan: 'Pro · 專業' } };
  const line = Buffer.from(`not json at all\n{"id":"r999","result":{}}\n\n${JSON.stringify({ id, result: account })}\n{"method":"unknown/event","params":{}}\n`, 'utf8');
  for (let at = 0; at < line.length; at += 7) fakes.last().stdout.write(line.subarray(at, at + 7)); // 7 bytes at a time cuts the non-ASCII characters
  await reading;
  assert.deepEqual([now().state, now().plan], ['signed_in', 'Pro · 專業']);
});

test('a sign-in that completes in the same chunk as its start\'s answer is taken as this sign-in\'s; nothing is opened for one already over', async () => {
  const { s, fakes, opened, now } = subscription();
  await s.check();
  fakes.last().stdin.removeAllListeners('data'); // answered by hand below
  const starting = s.login();
  await new Promise((r) => setTimeout(r, 10));
  // As the released connector writes them: the answer, then at once the completion it had buffered.
  fakes.last().stdout.write(`${JSON.stringify({ id: 'r2', result: { login_id: 'login-9', auth_url: LOGIN_URL } })}\n${JSON.stringify({ method: 'connection/login/completed', params: { login_id: 'login-9', success: false, error: 'login_failed' } })}\n`);
  await starting;
  assert.deepEqual([now().login, opened], ['failed', []]);
});

test('what the connector cannot make this app do: an error code named like a built-in, a stand-in for a missing fact, a child without pipes', async () => {
  const { s, fakes } = subscription();
  await s.check();
  const sent = request();
  let done = s.ask(sent);
  await until('sent', () => fakes.last().asks().length === 1);
  fakes.last().fail(fakes.last().asks()[0]!.id, 'toString');
  assert.deepEqual(await done, { status: 'refused', code: 'failed', reason: 'ChatGPT did not complete an answer' });
  // A provenance with a fact missing and "__proto__" in its place is not the request's.
  done = s.ask(request({ request_id: 'ask-proto.1' }));
  await until('sent', () => fakes.last().asks().length === 2);
  const call = fakes.last().asks()[1]!;
  const r = call.params['request'] as AskRequest;
  const context = JSON.stringify(r.context).replace('"media_position":null', '"__proto__":{}');
  fakes.last().stdout.write(`{"id":${JSON.stringify(call.id)},"result":{"request_id":"ask-proto.1","text":"x","provenance":{"request_id":"ask-proto.1","question":${JSON.stringify(r.question)},"assistance":"hint","image":{"sha256":"${r.image.sha256}","width":40,"height":20},"context":${context}},"model":"vision-model","auth_mode":"chatgpt","latency_ms":1,"thread_id":"t","turn_id":"u"}}\n`);
  assert.deepEqual(await done, { status: 'refused', code: 'unbound', reason: 'the answer is not bound to the request that was sent; it is not shown' });
  // An answer of 32,000 characters that are each two UTF-16 units is within the bound, as the connector counts it.
  assert.equal(typeof readAnswer({ request_id: sent.request_id, text: '𝑥'.repeat(ANSWER_MAX), provenance: provenanceOf(sent), model: 'vendor/model 1', auth_mode: 'chatgpt', latency_ms: 2.5, thread_id: 't', turn_id: 'u' }, sent), 'object');
  assert.equal(typeof readAnswer({ request_id: sent.request_id, text: '𝑥'.repeat(ANSWER_MAX + 1), provenance: provenanceOf(sent), model: 'm', auth_mode: 'chatgpt', latency_ms: 1, thread_id: 't', turn_id: 'u' }, sent), 'string');
  // A child that could not be given its pipes is not started; nothing is thrown.
  const none = subscription(WSL, { spawn: (() => Object.assign(new (await_emitter())(), { pid: undefined, stdin: null, stdout: null, kill: () => true })) as never });
  await none.s.check();
  assert.deepEqual([none.now().state, none.now().detail], ['unavailable', 'the connector could not be started']);
});

test('a change, or a completed sign-in, said while the account is being read is read once more: the newer state stands, and nothing but reads is sent', async () => {
  const SIGNED_OUT = { auth: { state: 'signed_out', mode: null, plan: null }, rate_limits: null, models: [] };
  // The sign-in completes while a read that already saw "signed out" is still out (the released connector's order).
  const { s, fakes, now, opened } = subscription();
  await s.login();
  const c = fakes.last();
  c.account = null; // answered by hand
  const checking = s.check();
  const read = c.calls.at(-1)!;
  assert.equal(read.method, 'connection/read');
  c.event('connection/changed', {});
  c.event('connection/login/completed', { login_id: 'login-1', success: true, error: null });
  await until('the events are read', () => now().login === 'none');
  assert.equal(c.count('connection/read'), 1, 'coalesced: no second read while the first is out');
  c.account = ACCOUNT;
  c.reply(read.id, SIGNED_OUT); // the older state
  await checking;
  assert.deepEqual([now().state, c.count('connection/read')], ['signed_in', 2], 'read once more, and the newer state is what is said');
  assert.deepEqual(c.calls.map((x) => x.method), ['connection/login/start', 'connection/read', 'connection/read'], 'no sign-in and no question was started by it');
  assert.equal(opened.length, 1, 'only the page the user\'s own press opened');
  // A change during a read after a plain Check: the same, whichever way it changed.
  const out = subscription();
  await out.s.check();
  assert.equal(out.now().state, 'signed_in');
  out.fakes.last().account = null;
  const again = out.s.check();
  const first = out.fakes.last().calls.at(-1)!;
  out.fakes.last().event('connection/changed', {});
  out.fakes.last().event('connection/changed', {});
  await new Promise((r) => setTimeout(r, 20));
  out.fakes.last().account = SIGNED_OUT;
  out.fakes.last().reply(first.id, ACCOUNT);
  await again;
  assert.deepEqual([out.now().state, out.fakes.last().count('connection/read')], ['signed_out', 3], 'two changes during one read are one more read');
  // A read that fails is not repeated; and a connector that says "changed" at every read is read a bounded number of times.
  const lost = subscription(WSL, {}, (k) => void (k.account = null));
  const failing = lost.s.check();
  await until('read', () => lost.fakes.made.length === 1 && lost.fakes.last().count('connection/read') === 1);
  lost.fakes.last().event('connection/changed', {});
  await new Promise((r) => setTimeout(r, 20));
  lost.fakes.last().fail(lost.fakes.last().calls[0]!.id, 'unavailable');
  await failing;
  assert.deepEqual([lost.now().state, lost.fakes.last().count('connection/read')], ['unavailable', 1]);
  const noisy = subscription(WSL, {}, (k) => void (k.onCall = (call) => (call.method === 'connection/read' ? k.event('connection/changed', {}) : undefined)));
  await noisy.s.check();
  assert.deepEqual([noisy.now().state, noisy.now().detail, noisy.fakes.last().count('connection/read')], ['unknown', 'the account may have changed since it was last read, and it is not read again by itself; check again', 4], 'a change it did not read: the state is not said as known');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(noisy.fakes.last().count('connection/read'), 4, 'and it stops there until the user checks again');
  assert.deepEqual(await noisy.s.ask(request()), { status: 'refused', code: 'local', reason: 'the sign-in state of the ChatGPT subscription is not known (check it in the control window)' });
  noisy.fakes.last().onCall = () => undefined;
  await noisy.s.check();
  assert.deepEqual([noisy.now().state, noisy.now().detail, noisy.fakes.last().count('connection/read'), noisy.fakes.last().asks().length], ['signed_in', null, 5, 0]);
  assert.deepEqual([out.now().state, out.now().detail], ['signed_out', null], 'a change that was read leaves nothing to say');
  // Before the user's first Check a change reads nothing (nothing is started for it).
  const idle = subscription();
  await idle.s.login();
  idle.fakes.last().event('connection/changed', {});
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(idle.fakes.last().count('connection/read'), 0);
});

test('an account read belongs to the connector it went to: once that one is fenced, lost or ended, nothing it said is published, nothing is read again, and no other connector is started', async () => {
  const line = (v: unknown): string => `${JSON.stringify(v)}\n`;
  const OVER = 'x'.repeat(256 * 1024 + 1); // over the bound, with no line end: the connector is fenced
  const CHANGED = line({ method: 'connection/changed', params: {} });
  const world = () => subscription(WSL, {}, (c) => void (c.account = null)); // every read is answered by hand
  const LOST = 'the connector was lost while the account was being read';
  // The lead's case, in one chunk: a change, the read's valid answer, then a line that is not the envelope's.
  const a = world();
  const checking = a.s.check();
  await until('read', () => a.fakes.made.length === 1 && a.fakes.last().count('connection/read') === 1);
  const c = a.fakes.last();
  c.stdout.write(CHANGED + line({ id: c.calls[0]!.id, result: ACCOUNT }) + OVER);
  await checking;
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([a.fakes.made.length, c.count('connection/read'), a.now().state, a.now().detail], [1, 1, 'unavailable', LOST], 'no second connector, no second read, and not said as signed in');
  assert.deepEqual([a.now().plan, a.now().models, a.now().model], [null, [], null], 'nothing of the answer is published');
  assert.deepEqual(a.said.filter((x) => x.mode === 'managed' && (x.state === 'signed_in' || x.state === 'signed_out' || x.state === 'unknown')), [], 'at no moment');
  assert.deepEqual(await a.s.ask(request()), { status: 'refused', code: 'local', reason: 'the connector, or the official Codex app server it runs, is not available' });
  assert.equal(a.fakes.made.length, 1, 'a question starts none either');
  // Only the user's own Check starts one again.
  const again = a.s.check();
  await until('a new connector, by the press', () => a.fakes.made.length === 2 && a.fakes.last().count('connection/read') === 1);
  a.fakes.last().reply(a.fakes.last().calls[0]!.id, ACCOUNT);
  await again;
  assert.deepEqual([a.now().state, a.now().detail, a.fakes.made.length], ['signed_in', null, 2]);
  // The same without any change said: a valid answer, then the fence, in one chunk.
  const b = world();
  const plain = b.s.check();
  await until('read', () => b.fakes.made.length === 1 && b.fakes.last().count('connection/read') === 1);
  b.fakes.last().stdout.write(line({ id: b.fakes.last().calls[0]!.id, result: ACCOUNT }) + OVER);
  await plain;
  assert.deepEqual([b.fakes.made.length, b.fakes.last().count('connection/read'), b.now().state, b.now().detail], [1, 1, 'unavailable', LOST]);
  // Fenced during the read that followed a change: the same.
  const d = world();
  const second = d.s.check();
  await until('read', () => d.fakes.made.length === 1 && d.fakes.last().count('connection/read') === 1);
  d.fakes.last().stdout.write(CHANGED + line({ id: d.fakes.last().calls[0]!.id, result: ACCOUNT }));
  await until('read again', () => d.fakes.last().count('connection/read') === 2);
  d.fakes.last().stdout.write(CHANGED + line({ id: d.fakes.last().calls[1]!.id, result: ACCOUNT }) + OVER);
  await second;
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([d.fakes.made.length, d.fakes.last().count('connection/read'), d.now().state, d.now().detail], [1, 2, 'unavailable', LOST]);
  // The app quits while a read is out, and the connector still answers it before it ends (the released one closes
  // its own child first): the quit is a fence too. Nothing it then says is published, and none is started.
  for (const reread of [false, true]) {
    const q = subscription(WSL, {}, (k) => void ((k.account = null), (k.endDelayMs = 80)));
    const quitting = q.s.check();
    await until('read', () => q.fakes.made.length === 1 && q.fakes.last().count('connection/read') === 1);
    const k = q.fakes.last();
    if (reread) {
      k.stdout.write(CHANGED + line({ id: k.calls[0]!.id, result: ACCOUNT }));
      await until('read again', () => k.count('connection/read') === 2);
    }
    const quit = q.s.quit();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(k.exited, false, 'still ending');
    k.stdout.write(line({ id: k.calls.at(-1)!.id, result: ACCOUNT })); // a valid answer, and nothing else
    await quitting;
    await quit;
    assert.deepEqual([q.fakes.made.length, k.count('connection/read'), q.now().state, q.now().plan, k.exited], [1, reread ? 2 : 1, 'unavailable', null, true]);
    assert.deepEqual(q.said.filter((x) => x.mode === 'managed' && ['signed_in', 'signed_out', 'unknown'].includes(x.state)), [], 'nothing of it was said at any moment');
  }
  // The connector ends by itself right after its valid answer (the answer is read first): the same.
  const e = world();
  const ending = e.s.check();
  await until('read', () => e.fakes.made.length === 1 && e.fakes.last().count('connection/read') === 1);
  e.fakes.last().stdout.once('data', () => e.fakes.last().exit(1)); // its exit is seen as the answer's chunk is read
  e.fakes.last().stdout.write(CHANGED + line({ id: e.fakes.last().calls[0]!.id, result: ACCOUNT }));
  await ending;
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([e.fakes.made.length, e.fakes.last().count('connection/read'), e.now().state], [1, 1, 'unavailable']);
  // Positive control: the same chunk without the fence is one more read, to the same connector, and then published.
  const ok = world();
  const fine = ok.s.check();
  await until('read', () => ok.fakes.made.length === 1 && ok.fakes.last().count('connection/read') === 1);
  ok.fakes.last().stdout.write(CHANGED + line({ id: ok.fakes.last().calls[0]!.id, result: { auth: { state: 'signed_out', mode: null, plan: null }, rate_limits: null, models: [] } }));
  await until('read again, by the same connector', () => ok.fakes.last().count('connection/read') === 2);
  ok.fakes.last().reply(ok.fakes.last().calls[1]!.id, ACCOUNT);
  await fine;
  assert.deepEqual([ok.fakes.made.length, ok.fakes.last().count('connection/read'), ok.now().state, ok.now().detail, ok.now().model], [1, 2, 'signed_in', null, 'vision-model']);
});

test('a sign-in whose start was answered by a connector that is then fenced in the same chunk opens nothing and is said as failed', async () => {
  const { s, fakes, opened, now } = subscription();
  await s.check();
  const c = fakes.last();
  c.stdin.removeAllListeners('data'); // answered by hand
  let id = '';
  c.stdin.on('data', (b: Buffer) => void (id = (JSON.parse(b.toString('utf8')) as { id: string }).id));
  const signing = s.login();
  await until('asked', () => id !== '');
  c.stdout.write(`${JSON.stringify({ id, result: { login_id: 'login-1', auth_url: LOGIN_URL } })}\n${'x'.repeat(256 * 1024 + 1)}`);
  await signing;
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([opened, now().login, now().state, now().detail, fakes.made.length], [[], 'failed', 'unavailable', 'the connector was ended here before the sign-in completed', 1]);
  // Positive control: the same answer without the fence opens the official page once and waits.
  const fine = subscription();
  await fine.s.check();
  await fine.s.login();
  assert.deepEqual([fine.opened, fine.now().login, fine.fakes.made.length], [[LOGIN_URL], 'waiting', 1]);
  // The app quits while the start is out, and the connector still answers it before it ends: nothing is opened.
  const q = subscription(WSL, {}, (k) => void (k.endDelayMs = 80));
  await q.s.check();
  const k = q.fakes.last();
  k.stdin.removeAllListeners('data');
  let start = '';
  k.stdin.on('data', (b: Buffer) => void (start = (JSON.parse(b.toString('utf8')) as { id: string }).id));
  k.stdin.on('end', () => void setTimeout(() => k.exit(0), 80)); // (its own handler was removed with the others)
  const press = q.s.login();
  await until('asked', () => start !== '');
  const quit = q.s.quit();
  await new Promise((r) => setTimeout(r, 10));
  k.stdout.write(`${JSON.stringify({ id: start, result: { login_id: 'login-1', auth_url: LOGIN_URL } })}\n`);
  await press;
  await quit;
  assert.deepEqual([q.opened, q.now().login, q.fakes.made.length, k.exited], [[], 'failed', 1, true]);
  assert.equal(q.said.some((x) => x.mode === 'managed' && x.login === 'waiting'), false);
  // The browser cannot be opened, and the connector was lost (or the sign-in cancelled) before that was known: the
  // "still waiting" text is not said over a sign-in that is over.
  for (const by of ['lost', 'cancelled'] as const) {
    let fail = (): void => undefined;
    const b = subscription(WSL, { openExternal: () => new Promise<void>((_ok, no) => (fail = () => no(new Error('no browser')))) });
    await b.s.check();
    const opening = b.s.login();
    await until('waiting', () => b.now().login === 'waiting');
    if (by === 'lost') b.fakes.last().exit(1);
    else await b.s.cancelLogin();
    const before = [b.now().login, b.now().detail];
    fail();
    await opening;
    assert.deepEqual([b.now().login, b.now().detail], before);
    assert.deepEqual(before, by === 'lost' ? ['failed', 'the connector ended before the sign-in completed'] : ['cancelled', null]);
  }
  // Positive control: it cannot be opened while the sign-in is waiting: said, and it goes on waiting.
  const nob = subscription(WSL, { openExternal: () => Promise.reject(new Error('no browser')) });
  await nob.s.check();
  await nob.s.login();
  const NO_BROWSER = 'the browser could not be opened for the sign-in page; the sign-in is still pending: cancel it, then sign in again';
  assert.deepEqual([nob.now().state, nob.now().login, nob.now().detail], ['signed_in', 'waiting', NO_BROWSER], 'nothing says to finish it in the browser');
  // A read does not wipe it, and a question is refused in words that fit.
  await nob.s.check();
  assert.deepEqual([nob.now().login, nob.now().detail], ['waiting', NO_BROWSER]);
  assert.deepEqual(await nob.s.ask(request()), { status: 'refused', code: 'local', reason: 'a sign-in is still pending, though its page could not be opened: cancel it in the control window' });
  await nob.s.cancelLogin();
  assert.deepEqual([nob.now().login, nob.now().detail], ['cancelled', null]);
});

test('a question refused as not signed in by a connector that is fenced in the same chunk is not said as signed out: the connector is not available', async () => {
  const { s, fakes, now, said } = subscription();
  await s.check();
  const c = fakes.last();
  const done = s.ask(request());
  await until('sent', () => c.asks().length === 1);
  const from = said.length;
  c.stdout.write(`${JSON.stringify({ id: c.asks()[0]!.id, error: { code: 'unauthenticated', message: 'raw' } })}\n${'x'.repeat(256 * 1024 + 1)}`);
  assert.deepEqual(await done, { status: 'refused', code: 'unauthenticated', reason: 'ChatGPT is not signed in (sign in from the control window)' });
  assert.deepEqual([now().state, fakes.made.length], ['unavailable', 1]);
  assert.equal(said.slice(from).some((x) => x.mode === 'managed' && x.state === 'signed_out'), false);
  // Positive control: the same refusal from a connector that goes on running is said as signed out.
  const live = subscription();
  await live.s.check();
  const asked = live.s.ask(request());
  await until('sent', () => live.fakes.last().asks().length === 1);
  live.fakes.last().fail(live.fakes.last().asks()[0]!.id, 'unauthenticated');
  await asked;
  assert.equal(live.now().state, 'signed_out');
});

test('a failed account read and a failed sign-in start are said in their own words, never as a question that was not answered', async () => {
  const READ: Record<string, string> = {
    failed: 'the account could not be read',
    quota: 'the account could not be read',
    invalid_request: 'the account could not be read',
    busy: 'the connector is busy, so the account was not read; check again',
    unauthenticated: 'the account could not be read: the connector says ChatGPT is not signed in',
    unavailable: 'the connector, or the official Codex app server it runs, is not available',
    'a code this app does not know': 'the account could not be read',
  };
  for (const [code, said] of Object.entries(READ)) {
    const { s, fakes, now } = subscription(WSL, {}, (c) => void ((c.account = null), (c.onCall = (call) => (call.method === 'connection/read' ? c.fail(call.id, code) : undefined))));
    await s.check();
    assert.deepEqual([now().state, now().detail, fakes.made.length], ['unavailable', said, 1], code);
  }
  const START: Record<string, string> = {
    failed: 'the sign-in could not be started',
    quota: 'the sign-in could not be started',
    unauthenticated: 'the sign-in could not be started',
    busy: 'a sign-in or a question is already pending in the connector, so no sign-in was started',
    unavailable: 'the connector, or the official Codex app server it runs, is not available',
  };
  for (const [code, said] of Object.entries(START)) {
    const { s, opened, now } = subscription(WSL, {}, (c) => void (c.manual.add('connection/login/start'), (c.onCall = (call) => (call.method === 'connection/login/start' ? c.fail(call.id, code) : undefined))));
    await s.check();
    await s.login();
    assert.deepEqual([now().login, now().detail, opened], ['failed', said, []], code);
  }
  // None of them speaks of an answer; only the sign-in's `busy` names a question, as the thing that is pending.
  for (const said of [...Object.values(READ), ...Object.values(START)]) assert.equal(/answer|did not complete|still being answered/.test(said), false, said);
});

test('a pending sign-in is not forgotten when the account reads as signed in: it stays pending with its Cancel, no question is sent meanwhile, and its completion is still taken', async () => {
  const { s, fakes, now, opened } = subscription();
  const c = () => fakes.last();
  // An earlier attempt that failed is no longer said once the account reads as signed in.
  await s.check();
  await s.login();
  c().event('connection/login/completed', { login_id: 'login-1', success: false, error: 'login_failed' });
  await until('failed', () => now().login === 'failed');
  await s.check();
  assert.deepEqual([now().state, now().login, now().detail], ['signed_in', 'none', null]);
  // A sign-in is waiting; the user checks; the account reads as signed in.
  await s.login();
  assert.equal(now().login, 'waiting');
  const calls = c().calls.length;
  await s.check();
  assert.deepEqual([now().state, now().login, now().detail], ['signed_in', 'waiting', 'a sign-in started here is still pending: finish it in your browser, or cancel it']);
  assert.deepEqual(c().calls.slice(calls).map((x) => x.method), ['connection/read'], 'it was not cancelled behind the user\'s back, and not forgotten');
  // The connector would refuse a question as busy while it holds that sign-in: said here, and nothing is sent.
  assert.deepEqual(await s.ask(request()), { status: 'refused', code: 'local', reason: 'a sign-in is still pending: finish it in your browser, or cancel it in the control window' });
  assert.equal(c().asks().length, 0);
  // Its completion is still this app's: taken, read again, and then a question can be sent.
  c().event('connection/login/completed', { login_id: 'login-1', success: true, error: null });
  await until('completed and read again', () => now().login === 'none' && now().state === 'signed_in' && now().detail === null);
  const asked = s.ask(request());
  await until('sent', () => c().asks().length === 1);
  c().answer('An answer.');
  assert.equal((await asked).status, 'answered');
  assert.equal(opened.length, 2, 'one page for each of the user\'s two presses');
  // The same while a sign-in is still starting.
  const starting = subscription(WSL, {}, (k) => void k.manual.add('connection/login/start'));
  await starting.s.check();
  void starting.s.login();
  await until('starting', () => starting.now().login === 'starting');
  // A read that says signed in does not forget it either; nothing is said of a browser or a Cancel yet.
  await starting.s.check();
  assert.deepEqual([starting.now().state, starting.now().login, starting.now().detail], ['signed_in', 'starting', null]);
  assert.deepEqual(await starting.s.ask(request()), { status: 'refused', code: 'local', reason: 'a sign-in is being started: no question can be sent until that sign-in is over' });
  assert.equal(starting.fakes.last().asks().length, 0);
  const start = starting.fakes.last().calls.find((x) => x.method === 'connection/login/start')!;
  starting.fakes.last().reply(start.id, { login_id: 'login-1', auth_url: LOGIN_URL });
  await until('waiting', () => starting.now().login === 'waiting');
  assert.deepEqual([starting.opened, starting.now().detail], [[LOGIN_URL], 'a sign-in started here is still pending: finish it in your browser, or cancel it']);
});

test('a sign-in is said as cancelled only when the connector acknowledged the cancel; until then it is still pending, and its completion is still taken', async () => {
  const NOT_CONFIRMED = 'the cancel of the sign-in was not confirmed: it may still be pending in the connector; cancel it again';
  const world = () => {
    const w = subscription(WSL, {}, (k) => void k.manual.add('connection/login/cancel'));
    return { ...w, c: () => w.fakes.last(), cancelId: () => w.fakes.last().calls.filter((x) => x.method === 'connection/login/cancel').at(-1)!.id };
  };
  const waiting = async () => {
    const w = world();
    await w.s.check();
    await w.s.login();
    assert.equal(w.now().login, 'waiting');
    return w;
  };
  // Acknowledged with exactly {}: cancelled. While its answer is out it is still said as waiting; a second press sends nothing.
  const a = await waiting();
  const cancelling = a.s.cancelLogin();
  await until('told', () => a.c().count('connection/login/cancel') === 1);
  void a.s.cancelLogin();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([a.now().login, a.now().detail, a.c().count('connection/login/cancel')], ['waiting', 'the sign-in is being cancelled', 1]);
  a.c().reply(a.cancelId(), {});
  await cancelling;
  assert.deepEqual([a.now().login, a.now().detail], ['cancelled', null]);
  // Refused, another shape, or no answer at all: not said as cancelled; it can be cancelled again.
  for (const answer of [(w: Awaited<ReturnType<typeof waiting>>) => w.c().fail(w.cancelId(), 'failed'), (w: Awaited<ReturnType<typeof waiting>>) => w.c().reply(w.cancelId(), { cancelled: true }), (w: Awaited<ReturnType<typeof waiting>>) => w.c().reply(w.cancelId(), null), () => undefined]) {
    const w = await waiting();
    const out = w.s.cancelLogin();
    await until('told', () => w.c().count('connection/login/cancel') === 1);
    answer(w);
    await out; // (unanswered: the request's own bound)
    assert.deepEqual([w.now().login, w.now().detail], ['waiting', NOT_CONFIRMED]);
    const again = w.s.cancelLogin();
    await until('told again', () => w.c().count('connection/login/cancel') === 2);
    w.c().reply(w.cancelId(), {});
    await again;
    assert.deepEqual([w.now().login, w.now().detail], ['cancelled', null]);
  }
  // The sign-in completes while the cancel is out: it is this app's sign-in still, so it is taken and the account read.
  const done = await waiting();
  const late = done.s.cancelLogin();
  await until('told', () => done.c().count('connection/login/cancel') === 1);
  done.c().event('connection/login/completed', { login_id: 'login-1', success: true, error: null });
  done.c().fail(done.cancelId(), 'invalid_request'); // the connector no longer holds it
  await late;
  await until('read again', () => done.c().count('connection/read') === 2 && done.now().state === 'signed_in');
  assert.deepEqual([done.now().login, done.now().detail], ['none', null], 'not said as cancelled, and not as unconfirmed');
  // The same, the connector acknowledging the cancel after all: the sign-in had completed, and that stands.
  const both = await waiting();
  const acked = both.s.cancelLogin();
  await until('told', () => both.c().count('connection/login/cancel') === 1);
  both.c().event('connection/login/completed', { login_id: 'login-1', success: true, error: null });
  await until('completed', () => both.now().login === 'none');
  both.c().reply(both.cancelId(), {});
  await acked;
  await until('read again', () => both.c().count('connection/read') === 2 && both.now().state === 'signed_in');
  assert.deepEqual([both.now().login, both.now().detail], ['none', null]);
  // A cancel that was not confirmed says nothing about the next sign-in (the stand-in gives every sign-in one id).
  const next = await waiting();
  const unconfirmed = next.s.cancelLogin();
  await until('told', () => next.c().count('connection/login/cancel') === 1);
  next.c().fail(next.cancelId(), 'failed');
  await unconfirmed;
  assert.equal(next.now().detail, NOT_CONFIRMED);
  next.c().event('connection/login/completed', { login_id: 'login-1', success: false, error: 'login_failed' });
  await until('failed', () => next.now().login === 'failed');
  await next.s.login();
  assert.deepEqual([next.now().login, next.now().detail], ['waiting', 'a sign-in started here is still pending: finish it in your browser, or cancel it']);
  // The connector says it was cancelled (its completion event) before the cancel's own answer: cancelled.
  const said = await waiting();
  const press = said.s.cancelLogin();
  await until('told', () => said.c().count('connection/login/cancel') === 1);
  said.c().event('connection/login/completed', { login_id: 'login-1', success: false, error: 'login_cancelled' });
  said.c().reply(said.cancelId(), {});
  await press;
  assert.deepEqual([said.now().login, said.now().detail], ['cancelled', null]);
  // The connector is lost while the cancel is out: said as the loss, not as cancelled.
  const lost = await waiting();
  const out = lost.s.cancelLogin();
  await until('told', () => lost.c().count('connection/login/cancel') === 1);
  lost.c().exit(1);
  await out;
  assert.deepEqual([lost.now().login, lost.now().detail, lost.now().state], ['failed', 'the connector ended before the sign-in completed', 'unavailable']);
  // The connector says it holds no such sign-in (its answer to a cancel of one that is over there): not pending, and
  // not said as cancelled, since no completion of it reached this app.
  const over = await waiting();
  const press2 = over.s.cancelLogin();
  await until('told', () => over.c().count('connection/login/cancel') === 1);
  over.c().fail(over.cancelId(), 'invalid_request');
  await press2;
  assert.deepEqual([over.now().login, over.now().detail], ['failed', 'the connector no longer holds that sign-in; whether it completed is not known (check the connection)']);
  assert.equal((await over.s.ask(request({ request_id: 'ask-after-cancel.1' }))).status === 'refused', false, 'a question can be asked again');
  // An address that is not opened: its cancel's answer is read too.
  const NOT_OPENED = 'the sign-in address the connector gave is not an official ChatGPT address, so it was not opened';
  for (const answer of ['acknowledged', 'not held', 'refused', 'another shape'] as const) {
    const w = world();
    await w.s.check();
    w.c().loginUrl = 'https://auth.openai.com.evil.example/authorize';
    const starting = w.s.login();
    await until('its cancel is told', () => w.c().count('connection/login/cancel') === 1);
    assert.equal(w.now().login, 'starting');
    if (answer === 'acknowledged') w.c().reply(w.cancelId(), {});
    else if (answer === 'not held') w.c().fail(w.cancelId(), 'invalid_request');
    else if (answer === 'refused') w.c().fail(w.cancelId(), 'failed');
    else w.c().reply(w.cancelId(), { cancelled: true });
    await starting;
    if (answer === 'acknowledged' || answer === 'not held') {
      // That sign-in is over in the connector: said as not started, and the connector goes on.
      assert.deepEqual([w.opened, w.now().login, w.now().detail, w.now().state, w.c().exited], [[], 'refused_address', NOT_OPENED, 'signed_in', false], answer);
      continue;
    }
    // The connector did not let go of a sign-in this app refused: it is ended, so nothing stays pending in it.
    await until('ended', () => w.c().exited);
    assert.deepEqual([w.opened, w.now().login, w.now().state, w.fakes.made.length], [[], 'refused_address', 'unavailable', 1], answer);
    assert.equal(w.now().detail, `${NOT_OPENED}; the connector did not confirm that it let that sign-in go, so that connector is no longer used and is being ended (check the connection to start one again)`);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(w.fakes.made.length, 1, 'none is started by the app itself');
    await w.s.check(); // only the user's own Check starts one again
    assert.deepEqual([w.fakes.made.length, w.now().state, w.now().login], [2, 'signed_in', 'none']);
  }
  // The connector is lost while that cancel is out: said as the loss; nothing is opened and nothing stays pending.
  const gone = world();
  await gone.s.check();
  gone.c().loginUrl = 'https://auth.openai.com.evil.example/authorize';
  const refused = gone.s.login();
  await until('its cancel is told', () => gone.c().count('connection/login/cancel') === 1);
  gone.c().exit(1);
  await refused;
  assert.deepEqual([gone.opened, gone.now().login, gone.now().state, gone.now().detail, gone.fakes.made.length], [[], 'failed', 'unavailable', 'the connector ended before the sign-in completed', 1]);
});

test('"the account changed" is read a bounded number of times between the user\'s own Checks, also when it is said after each read; sparse changes are each read', async () => {
  const CHECK_AGAIN = 'the account may have changed since it was last read, and it is not read again by itself; check again';
  // A connector that says "changed" just after every answer (the bound inside one read does not see these).
  const { s, fakes, now, said } = subscription(WSL, {}, (c) => void (c.onCall = (call) => (call.method === 'connection/read' ? void setImmediate(() => c.event('connection/changed', {})) : undefined)));
  await s.check();
  await until('not known', () => now().state === 'unknown');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual([fakes.last().count('connection/read'), now().state, now().detail, fakes.made.length], [4, 'unknown', CHECK_AGAIN, 1], 'the user\'s read and three for changes; then no more');
  const notices = said.length;
  for (let i = 0; i < 20; i += 1) fakes.last().event('connection/changed', {});
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual([fakes.last().count('connection/read'), said.length], [4, notices], 'further changes read nothing and say nothing');
  assert.deepEqual(await s.ask(request()), { status: 'refused', code: 'local', reason: 'the sign-in state of the ChatGPT subscription is not known (check it in the control window)' });
  // The user's own Check reads again, with the same bound.
  await s.check();
  await until('not known again', () => now().state === 'unknown' && fakes.last().count('connection/read') === 8);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(fakes.last().count('connection/read'), 8);
  // Once the connector stops saying it, the user's Check stands.
  fakes.last().onCall = () => undefined;
  await s.check();
  assert.deepEqual([now().state, now().detail, fakes.last().count('connection/read')], ['signed_in', null, 9]);
  assert.equal(fakes.last().calls.every((x) => x.method === 'connection/read'), true, 'only reads were ever sent');
  // Sparse changes (fewer than the bound within a span) are each read, however many there are over time.
  const sparse = subscription(WSL, { change_window_ms: 30 });
  await sparse.s.check();
  for (let i = 0; i < 6; i += 1) {
    await new Promise((r) => setTimeout(r, 45));
    sparse.fakes.last().event('connection/changed', {});
    await until('read', () => sparse.fakes.last().count('connection/read') === 2 + i && sparse.now().state === 'signed_in');
  }
  assert.deepEqual([sparse.now().state, sparse.now().detail, sparse.fakes.last().count('connection/read')], ['signed_in', null, 7]);
  // The user's Check pressed while a change's read is out gets a full read of its own.
  const pressed = subscription(WSL, {}, (c) => void (c.account = null));
  const first = pressed.s.check();
  await until('read', () => pressed.fakes.made.length === 1 && pressed.fakes.last().count('connection/read') === 1);
  const k = pressed.fakes.last();
  for (let i = 0; i < 3; i += 1) {
    k.event('connection/changed', {});
    k.reply(k.calls.at(-1)!.id, ACCOUNT);
    await until('read again', () => k.count('connection/read') === 2 + i);
  }
  k.event('connection/changed', {}); // a fourth change: over the bound, unless the user checks
  void pressed.s.check();
  await new Promise((r) => setTimeout(r, 20));
  k.reply(k.calls.at(-1)!.id, ACCOUNT);
  await until('read for the user', () => k.count('connection/read') === 5);
  k.reply(k.calls.at(-1)!.id, ACCOUNT);
  await first;
  assert.deepEqual([pressed.now().state, pressed.now().detail, k.count('connection/read')], ['signed_in', null, 5]);
  // Once the bound is reached nothing more is read for a change, however long after: only the user's Check, or the
  // user's own sign-in completing, reads again. (Both ways of reaching it: said after each read, and during each.)
  for (const during of [false, true]) {
    const l = subscription(WSL, { change_window_ms: 30 }, (c) => void (c.onCall = (call) => (call.method !== 'connection/read' ? undefined : during ? c.event('connection/changed', {}) : void setImmediate(() => c.event('connection/changed', {})))));
    await l.s.check();
    await until('not known', () => l.now().state === 'unknown');
    const c = l.fakes.last();
    c.onCall = () => undefined;
    await new Promise((r) => setTimeout(r, 90)); // three spans later
    c.event('connection/changed', {});
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual([c.count('connection/read'), l.now().state, l.now().detail], [4, 'unknown', CHECK_AGAIN], during ? 'during each read' : 'after each read');
    await l.s.login();
    assert.deepEqual([l.now().state, l.now().login, l.now().detail], ['unknown', 'waiting', CHECK_AGAIN], 'a sign-in press does not wipe what is said of the state');
    c.event('connection/login/completed', { login_id: 'login-1', success: true, error: null });
    await until('read for the completed sign-in', () => c.count('connection/read') === 5 && l.now().state === 'signed_in');
    assert.deepEqual([l.now().login, l.now().detail], ['none', null]);
  }
  // A slow, steady "changed" (under the rate, span after span) is bounded too: in all, between the user's Checks.
  const slow = subscription(WSL, { change_window_ms: 1 }, (c) => void (c.onCall = (call) => (call.method === 'connection/read' ? void setTimeout(() => c.event('connection/changed', {}), 2) : undefined)));
  await slow.s.check();
  await until('not known', () => slow.now().state === 'unknown', 8000);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual([slow.fakes.last().count('connection/read'), slow.now().detail], [65, CHECK_AGAIN], 'the user\'s read and 64 for changes');
  await slow.s.check();
  await until('not known again', () => slow.now().state === 'unknown' && slow.fakes.last().count('connection/read') === 130, 8000);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual([slow.fakes.last().count('connection/read'), slow.fakes.made.length], [130, 1], 'the user\'s Check: its read and another 64');
  // A question refused as not signed in while a read is out does not end that read's turn: it is read once more.
  const mid = subscription();
  await mid.s.check();
  const asked = mid.s.ask(request());
  await until('sent', () => mid.fakes.last().asks().length === 1);
  mid.fakes.last().account = null;
  mid.fakes.last().event('connection/changed', {});
  await until('a read is out', () => mid.fakes.last().count('connection/read') === 2 && mid.now().state === 'checking');
  mid.fakes.last().fail(mid.fakes.last().asks()[0]!.id, 'unauthenticated');
  assert.equal((await asked).status, 'refused');
  assert.equal(mid.now().state, 'checking', 'the read that is out says how it is, not the question');
  const SIGNED_OUT = { auth: { state: 'signed_out', mode: null, plan: null }, rate_limits: null, models: [] };
  mid.fakes.last().account = SIGNED_OUT;
  mid.fakes.last().reply(mid.fakes.last().calls.filter((x) => x.method === 'connection/read')[1]!.id, ACCOUNT); // the older answer
  await until('read once more', () => mid.fakes.last().count('connection/read') === 3 && mid.now().state === 'signed_out');
  assert.equal(mid.now().detail, null);
  // The same refusal after a read failed: said as not signed in, without the failed read's reason beside it.
  const failed = subscription();
  await failed.s.check();
  const out = failed.s.ask(request());
  await until('sent', () => failed.fakes.last().asks().length === 1);
  failed.fakes.last().account = null;
  failed.fakes.last().event('connection/changed', {});
  await until('a read is out', () => failed.fakes.last().count('connection/read') === 2);
  failed.fakes.last().fail(failed.fakes.last().calls.filter((x) => x.method === 'connection/read')[1]!.id, 'busy');
  await until('the read failed', () => failed.now().state === 'unavailable');
  assert.equal(failed.now().detail, 'the connector is busy, so the account was not read; check again');
  failed.fakes.last().fail(failed.fakes.last().asks()[0]!.id, 'unauthenticated');
  await out;
  assert.deepEqual([failed.now().state, failed.now().detail], ['signed_out', null]);
  // The same refusal once changes are no longer read: the state stays "not known" with its notice (the question's
  // own card says it was refused); only the user's Check says how the account is.
  const latched = subscription();
  await latched.s.check();
  const held = latched.s.ask(request());
  await until('sent', () => latched.fakes.last().asks().length === 1);
  for (let i = 0; i < 4; i += 1) {
    latched.fakes.last().event('connection/changed', {});
    await until('read, or not', () => latched.now().state !== 'checking' && latched.fakes.last().count('connection/read') === Math.min(2 + i, 4));
  }
  assert.deepEqual([latched.now().state, latched.now().detail], ['unknown', CHECK_AGAIN]);
  latched.fakes.last().fail(latched.fakes.last().asks()[0]!.id, 'unauthenticated');
  assert.deepEqual(await held, { status: 'refused', code: 'unauthenticated', reason: 'ChatGPT is not signed in (sign in from the control window)' });
  assert.deepEqual([latched.now().state, latched.now().detail], ['unknown', CHECK_AGAIN], 'not said as signed out from the question alone');
  await latched.s.check();
  assert.deepEqual([latched.now().state, latched.now().detail], ['signed_in', null]);
});

test('a cancel or a Stop is a confirmed interruption only by its own exact receipt; anything else, cancelled:false included, stays not confirmed', async () => {
  const outcomeOf = async (set: (c: FakeConnector) => void, by: 'cancel' | 'stop'): Promise<AskOutcome> => {
    const { s, fakes } = subscription();
    await s.check();
    set(fakes.last());
    const sent = request();
    const done = s.ask(sent);
    await until('sent', () => fakes.last().asks().length === 1);
    if (by === 'cancel') s.cancel(sent.request_id);
    else s.stopSession(sent.context.capture_session_id);
    return done; // the question itself ends as `cancelled`, as the released connector ends it
  };
  for (const result of [{}, null, [], 'cancelled', { uncertain: 'unknown' }, { cancelled: true, uncertain: 'unknown' }, { cancelled: true }, { uncertain: false }, { cancelled: 'true', uncertain: false }, { cancelled: true, uncertain: false, more: 1 }, { cancelled: false, uncertain: false }, { cancelled: true, uncertain: true }]) {
    assert.deepEqual(await outcomeOf((c) => void (c.cancelReceipt = { result }), 'cancel'), { status: 'cancelled', uncertain: true }, `ask/cancel answered ${JSON.stringify(result)}`);
  }
  assert.deepEqual(await outcomeOf((c) => void (c.cancelReceipt = { result: { cancelled: true, uncertain: false } }), 'cancel'), { status: 'cancelled', uncertain: false });
  // session/stop has its own acknowledgement: exactly {}. A cancel's receipt is not a Stop's, nor the reverse.
  for (const result of [null, [], 'stopped', { stopped: true }, { cancelled: true, uncertain: false }]) {
    assert.deepEqual(await outcomeOf((c) => void (c.stopReceipt = { result }), 'stop'), { status: 'cancelled', uncertain: true }, `session/stop answered ${JSON.stringify(result)}`);
  }
  assert.deepEqual(await outcomeOf((c) => void (c.stopReceipt = { result: {} }), 'stop'), { status: 'cancelled', uncertain: false });
  // Both were said (Cancel, then Stop): confirmed only if each was.
  const both = subscription();
  await both.s.check();
  both.fakes.last().onCancel = 'silent';
  both.fakes.last().stopReceipt = { result: { ok: true } };
  const sent = request();
  const done = both.s.ask(sent);
  await until('sent', () => both.fakes.last().asks().length === 1);
  both.s.cancel(sent.request_id);
  both.s.stopSession(sent.context.capture_session_id);
  await until('both told', () => both.fakes.last().count('session/stop') === 1);
  both.fakes.last().fail(both.fakes.last().asks()[0]!.id, 'cancelled');
  assert.deepEqual(await done, { status: 'cancelled', uncertain: true });
});

const SHIM_ENDED = 'a connector that was ended here did not end by itself in time; its wsl.exe shim was ended, which does not show that the connector, or the Codex app server it runs, ended in WSL';
const SHIM_NOT_ENDED = 'a connector that was ended here did not end by itself in time; its wsl.exe shim did not end either, so it is not known that the connector, or the Codex app server it runs, ended in WSL';

test('a question the connector ends as cancelled, when this app asked for no cancel and no Stop, is not said as a confirmed stop; nothing is sent again and no connector is started', async () => {
  const { s, fakes, now } = subscription();
  await s.check();
  const c = fakes.last();
  const done = s.ask(request());
  await until('sent', () => c.asks().length === 1);
  c.fail(c.asks()[0]!.id, 'cancelled'); // as the released connector does at its request-history limit
  assert.deepEqual(await done, { status: 'cancelled', uncertain: true });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([c.count('ask/cancel'), c.count('session/stop'), c.asks().length, fakes.made.length, now().state, now().asking], [0, 0, 1, 1, 'signed_in', false], 'no cancel or Stop of this app, one send, one connector');
  // The same reply after this app's own confirmed cancel, or its confirmed Stop, is the confirmed stop it was.
  for (const by of ['cancel', 'stop'] as const) {
    const own = subscription();
    await own.s.check();
    const sent = request();
    const asked = own.s.ask(sent);
    await until('sent', () => own.fakes.last().asks().length === 1);
    if (by === 'cancel') own.s.cancel(sent.request_id);
    else own.s.stopSession(sent.context.capture_session_id);
    assert.deepEqual(await asked, { status: 'cancelled', uncertain: false }, by);
  }
  // interrupt_unconfirmed stays what it says.
  const un = subscription();
  await un.s.check();
  const held = un.s.ask(request());
  await until('sent', () => un.fakes.last().asks().length === 1);
  un.fakes.last().fail(un.fakes.last().asks()[0]!.id, 'interrupt_unconfirmed');
  assert.deepEqual(await held, { status: 'cancelled', uncertain: true });
});

test('a connector that does not end by itself within its time: its shim is ended, that its own end was not seen is said and kept, and nothing is started in its place', async () => {
  // Fenced for a line that is not the envelope's, while it ignores the end of its input.
  const { s, fakes, now, said } = subscription(WSL, { end_ms: 80 }, (c) => void (c.endDelayMs = 60_000));
  await s.check();
  const c = fakes.last();
  let kills = 0;
  const kill = c.kill.bind(c);
  c.kill = () => (kills++, kill());
  c.stdout.write('x'.repeat(256 * 1024 + 1));
  await until('fenced', () => now().state === 'unavailable');
  assert.deepEqual([now().detail, kills, c.exited], [null, 0, false], 'still within its time: nothing is said yet, and it is not killed');
  await until('its shim was ended', () => c.exited);
  await until('said', () => now().detail === SHIM_ENDED);
  assert.deepEqual([now().state, kills, fakes.made.length], ['unavailable', 1, 1]);
  assert.equal((said.at(-1) as { detail?: string | null }).detail, SHIM_ENDED, 'the windows are told');
  // Nothing is started or sent by the app itself, and a question is refused without starting one.
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(await s.ask(request()), { status: 'refused', code: 'local', reason: 'the connector, or the official Codex app server it runs, is not available' });
  assert.equal(fakes.made.length, 1);
  // The user's own Check starts another; what was not seen of the first stays said (nothing later shows it ended).
  await s.check();
  const second = fakes.last();
  second.endDelayMs = 0; // this one ends at the end of its input
  let kills2 = 0;
  const kill2 = second.kill.bind(second);
  second.kill = () => (kills2++, kill2());
  assert.deepEqual([fakes.made.length, now().state, now().detail], [2, 'signed_in', SHIM_ENDED]);
  await s.quit();
  assert.deepEqual([second.exited, kills2, now().detail], [true, 0, SHIM_ENDED], 'the second ended by itself: what was not seen of the first is still kept');
  // A shim that does not end when it is ended either: kept as that, also when a later connector's shim does end.
  const stuck = subscription(WSL, { end_ms: 60 }, (k) => void (k.endDelayMs = 60_000));
  await stuck.s.check();
  const k = stuck.fakes.last();
  k.kill = () => true; // the kill is taken and nothing ends
  k.stdout.write('x'.repeat(256 * 1024 + 1));
  await until('said (its own bound, then two seconds more for the ended shim)', () => stuck.now().detail === SHIM_NOT_ENDED, 5000);
  assert.deepEqual([k.exited, stuck.now().state, stuck.fakes.made.length], [false, 'unavailable', 1]);
  await stuck.s.check();
  const later = stuck.fakes.last();
  assert.notEqual(later, k);
  await stuck.s.quit(); // the later one's shim is ended by the kill
  assert.deepEqual([later.exited, stuck.now().detail], [true, SHIM_NOT_ENDED], 'the first one\'s shim is still not seen to end');
  // Its exit arriving after all is taken: its shim ended; that is still not the connector's own end.
  k.exit(0);
  await until('its late exit is taken, and said', () => (stuck.said.at(-1) as { detail?: string | null }).detail === SHIM_ENDED);
  // A sign-in pending in a connector that is ended here is not said as "the connector ended".
  const signing = subscription(WSL, { end_ms: 60 }, (c2) => void (c2.endDelayMs = 60_000));
  await signing.s.check();
  await signing.s.login();
  signing.fakes.last().stdout.write('x'.repeat(256 * 1024 + 1));
  await until('said', () => (signing.now().detail ?? '').includes('did not end by itself'));
  assert.deepEqual([signing.now().login, signing.now().detail], ['failed', `the connector was ended here before the sign-in completed; ${SHIM_ENDED}`]);
});

test('an end that was not seen is handed over to be written, with its time and whether the shim\'s exit was seen; a failed write is said and tried once more at quit; earlier records are said as past', async () => {
  const written: Array<{ at: string; shim: string }> = [];
  let fail: string | null = null;
  const agains: boolean[] = [];
  const recordEnd = (end: { at: string; shim: string }, again: boolean): string | null => {
    if (fail === null) (written.push({ ...end }), agains.push(again));
    return fail;
  };
  // The shim ends when it is ended: one record.
  const a = subscription(WSL, { end_ms: 60, recordEnd }, (c) => void (c.endDelayMs = 60_000));
  await a.s.check();
  assert.deepEqual([a.s.running(), a.s.endsUnsaved()], [true, null]);
  const quitting = a.s.quit();
  assert.deepEqual([a.s.running(), a.now().detail], [false, 'the app is closing: the connector is being ended']);
  await quitting;
  assert.deepEqual([written.length, written[0]!.shim, Object.keys(written[0]!).sort(), a.now().detail, a.s.endsUnsaved()], [1, 'ended', ['at', 'shim'], SHIM_ENDED, null]);
  assert.equal(new Date(written[0]!.at).toISOString(), written[0]!.at);
  // The shim does not end either; its exit comes later: the same record again, by its time.
  written.length = 0;
  const b = subscription(WSL, { end_ms: 60, recordEnd }, (c) => void (c.endDelayMs = 60_000));
  await b.s.check();
  const k = b.fakes.last();
  k.kill = () => true;
  await b.s.quit();
  assert.deepEqual([written.map((e) => e.shim), b.now().detail], [['not_ended'], SHIM_NOT_ENDED]);
  k.exit(0);
  await until('its late exit is recorded', () => written.length === 2);
  assert.deepEqual([written[1]!.shim, written[1]!.at, b.now().detail], ['ended', written[0]!.at, SHIM_ENDED]);
  assert.deepEqual(agains.slice(-2), [false, true], 'the second is the same end, said again');
  // It cannot be written: said, not taken as saved; tried once more at the next quit.
  written.length = 0;
  fail = 'EIO: injected';
  const f = subscription(WSL, { end_ms: 60, recordEnd }, (c) => void (c.endDelayMs = 60_000));
  await f.s.check();
  await f.s.quit();
  assert.deepEqual([written.length, f.s.endsUnsaved(), f.now().detail], [0, 'EIO: injected', `${SHIM_ENDED}; this is not written on this device as it is said here (EIO: injected); writing it is tried again as the app quits, and unless that works the next launch will not say it as it is said here`]);
  fail = null;
  await f.s.quit();
  assert.deepEqual([written.length, f.s.endsUnsaved(), f.now().detail, f.fakes.made.length], [1, null, SHIM_ENDED, 1]);
  assert.equal(agains.at(-1), false, 'never written before: a first write');
  // An end whose first write failed, then its shim's late exit: that is its first write, not the same end again.
  written.length = 0;
  agains.length = 0;
  fail = 'EIO: injected';
  const late = subscription(WSL, { end_ms: 60, recordEnd }, (c) => void (c.endDelayMs = 60_000));
  await late.s.check();
  const stuck = late.fakes.last();
  stuck.kill = () => true;
  late.fakes.last().stdout.write('x'.repeat(256 * 1024 + 1));
  await until('not written', () => late.s.endsUnsaved() === 'EIO: injected', 5000);
  fail = null;
  stuck.exit(0);
  await until('written at its late exit', () => written.length === 1);
  assert.deepEqual([written[0]!.shim, agains, late.s.endsUnsaved()], ['ended', [false], null]);
  // A connector that ends by itself records nothing.
  written.length = 0;
  const clean = subscription(WSL, { end_ms: 60, recordEnd });
  await clean.s.check();
  await clean.s.quit();
  assert.deepEqual([written.length, clean.now().detail], [0, null]);
  // What earlier runs recorded: said from the start as past records, and not removed by a connection that works.
  const PAST = 'earlier runs of this app recorded 3 connector end(s) that were not seen (the latest at 2026-10-01T10:00:00.000Z; wsl.exe shim not seen to end either: 1 of the 2 listed); these are past records: they do not show that anything is still running, or that it has ended since';
  const past = subscription(WSL, { earlier: { ends: [{ at: '2026-09-30T10:00:00.000Z', shim: 'not_ended' }, { at: '2026-10-01T10:00:00.000Z', shim: 'ended' }], older: 1, unreadable: false } });
  assert.deepEqual([past.now().state, past.now().detail, past.fakes.made.length], ['not_checked', PAST, 0]);
  await past.s.check();
  assert.deepEqual([past.now().state, past.now().detail], ['signed_in', PAST]);
  await past.s.quit();
  assert.equal(past.now().detail, PAST);
  const unreadable = subscription(WSL, { earlier: { ends: [], older: 0, unreadable: true } });
  assert.equal(unreadable.now().detail, 'the record of connector ends from earlier runs could not be read on this device, and is left as it is');
  assert.equal(subscription(WSL, { earlier: { ends: [], older: 0, unreadable: false } }).now().detail, null);
});

test('with the time it is given by default, a connector that takes its own full cleanup time (8 s) to end is not killed, and its end is seen', { timeout: 20_000 }, async () => {
  assert.equal(CONNECTOR_END_MS, 10_000, 'the connector\'s 8 s cleanup bound and a margin');
  const { s, fakes, now } = subscription(WSL, { end_ms: undefined }, (c) => void (c.endDelayMs = 8_200));
  await s.check();
  const c = fakes.last();
  let kills = 0;
  const kill = c.kill.bind(c);
  c.kill = () => (kills++, kill());
  const from = Date.now();
  await s.quit();
  const took = Date.now() - from;
  assert.deepEqual([c.exited, kills, now().detail], [true, 0, null], 'ended by the end of its input, by itself');
  assert.equal(took >= 8_000 && took < 9_500, true, `the quit waited for it (${took} ms)`);
});

test('a connector ended here for a line that is not the envelope\'s: its real end is seen, it is not killed after it ended, and quitting does not wait on it', async () => {
  const { s, fakes, now } = subscription(WSL, { end_ms: 150 });
  await s.check();
  const c = fakes.last();
  let kills = 0;
  const kill = c.kill.bind(c);
  c.kill = () => (kills++, kill());
  c.stdout.write('x'.repeat(256 * 1024 + 1)); // over the bound, with no line end
  await until('ended at the end of its input', () => c.exited);
  assert.equal(now().state, 'unavailable');
  await new Promise((r) => setTimeout(r, 300)); // past the bound on its end
  assert.equal(kills, 0, 'it had ended: nothing is killed');
  const from = Date.now();
  await s.quit();
  assert.equal(Date.now() - from < 100, true, 'nothing is waited for');
  assert.equal(now().detail, null, 'its own end was seen: nothing is said of it');
  // One that does not end at the end of its input is still waited for by the quit, then killed, once.
  const slow = subscription(WSL, { end_ms: 80 }, (k) => void (k.endDelayMs = 60_000));
  await slow.s.check();
  const k = slow.fakes.last();
  let killed = 0;
  const end = k.kill.bind(k);
  k.kill = () => (killed++, end());
  k.stdout.write('x'.repeat(256 * 1024 + 1));
  await until('fenced', () => slow.now().state === 'unavailable');
  assert.equal(k.exited, false);
  await slow.s.quit();
  assert.deepEqual([k.exited, killed], [true, 1], 'the quit returns only once the fenced child\'s shim has ended');
  assert.equal(slow.now().detail, SHIM_ENDED, 'that its own end was not seen is kept in the status (no window is open at a quit to show it)');
  // Two fenced one after the other, the first still ending: the quit waits for both.
  const two = subscription(WSL, { end_ms: 80 });
  await two.s.check();
  const first = two.fakes.last();
  first.endDelayMs = 60_000;
  first.stdout.write('x'.repeat(256 * 1024 + 1));
  await until('the first is fenced', () => two.now().state === 'unavailable');
  await two.s.check(); // the user's own Check starts another
  const second = two.fakes.last();
  assert.notEqual(second, first);
  second.stdout.write('x'.repeat(256 * 1024 + 1));
  await until('the second ended', () => second.exited);
  assert.equal(first.exited, false);
  await two.s.quit();
  assert.deepEqual([first.exited, second.exited], [true, true]);
});

test('a real child process over real pipes: lines both ways, and the end of its input ends it', async () => {
  const script = path.join(import.meta.dirname, 'fake-connector.mjs');
  let child: ReturnType<typeof spawn> | null = null;
  const { s, now } = subscription(WSL, { spawn: (() => (child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }))) as never, request_ms: 10_000, ask_ms: 10_000, end_ms: 5_000 });
  await s.check();
  assert.deepEqual([now().state, now().model], ['signed_in', 'vision-model']);
  const sent = request();
  const outcome: AskOutcome = await s.ask(sent);
  assert.equal(outcome.status === 'answered' && outcome.answer.text, 'SYNTHETIC answer from the test connector: 40x20 px, hint');
  const exited = new Promise<number | null>((r) => child!.once('exit', (code) => r(code)));
  await s.quit();
  assert.equal(await exited, 0, 'ended by the end of its input, not killed');
});
