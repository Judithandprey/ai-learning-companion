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
import { readConnectorConfig, Subscription, type AskOutcome, type ConnectorConfig, type SubscriptionStatus } from '../src/main/subscription.ts';
import { ANSWER_MAX, contextProblem, officialLoginUrl, provenanceOf, questionOf, readAccount, readAnswer, type AskRequest } from '../src/shared/subscription-ask.ts';
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
  assert.deepEqual([noisy.now().state, noisy.now().detail, noisy.fakes.last().count('connection/read')], ['unknown', 'the account changed again while it was being read; check again', 4], 'a change it did not read: the state is not said as known');
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
  assert.deepEqual([k.exited, killed], [true, 1], 'the quit returns only once the fenced child has really ended');
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
