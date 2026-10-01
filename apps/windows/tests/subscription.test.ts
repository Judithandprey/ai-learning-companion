// The managed ChatGPT subscription from this app's side (src/main/subscription.ts, src/shared/live.ts): the trusted
// configuration, the envelope's lines (lc-subscription-live/1), the sign-in, the AI session and its turns, an
// interruption, a stopped session, and the child's lifetime. SYNTHETIC: the connector is a stand-in
// (tests/subscription-fakes.ts, and a small real child process for the pipes); no Codex, no ChatGPT, no sign-in and no
// network are involved. Every test here is synthetic: an "answer" is text the test wrote. (The envelope's pure rules
// - a turn, a focus, the account as read, an answer's binding - are in tests/live.test.ts.)
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { CONNECTOR_END_MS, readConnectorConfig, Subscription, type ConnectorConfig, type SessionStart, type SubscriptionStatus, type TurnOutcome } from '../src/main/subscription.ts';
import { focusOf, LINE_TO_CONNECTOR_MAX, LIVE_ERROR_TEXT, LIVE_LINE_FROM_CONNECTOR_MAX, LIVE_VERSION, officialLoginUrl, provenanceOf, readLiveResult, RESULT_TEXT_MAX, turnProblem, userTextOf, userTextProblem, wholeRegions, type Policy, type Start, type Turn } from '../src/shared/live.ts';
import { ACCOUNT, bucket, fakeConnectors, LOGIN_URL, type FakeConnector } from './subscription-fakes.ts';

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

// ---- an AI session and its turns, as the app makes them ----------------------------------------------------------
const SESSION = 'live-0123456789abcdef';
const OTHER_SESSION = 'live-fedcba9876543210';
const CAPTURE = '0123456789abcdef';
/** A session's own bounds, as the user chose them before Start (never the provider's quota). */
const POLICY: Policy = { max_submissions: 12, max_session_ms: 300_000, min_observation_interval_ms: 30_000 };
/** What the app writes for that Start, and what the stand-in connector answers it by itself. */
const START: Start = { session_id: SESSION, capture_session_id: CAPTURE, epoch: 1, model: 'vision-model', policy: POLICY, permissions: { screen: true, microphone: false, system_audio: false } };
const STARTED = { session_id: SESSION, epoch: 1, remaining_submissions: 12, expires_in_ms: 300_000 };
const BOUNDS = { x: -1280, y: 0, width: 1280, height: 800 };
const FRAME = { width: 2560, height: 1600 };
/**
 * A turn as the app builds one (the shape of tests/live.test.ts): the WHOLE display as the picture and the context (a
 * 2560x1600 frame of a 1280x800 display at a negative desktop origin), and, unless said otherwise, a circle's focus
 * asking for a small hint. The picture's bytes are a stand-in: the transport never reads them.
 */
const turn = (o: Partial<Turn> = {}): Turn => ({
  request_id: `${SESSION}.7.focus`,
  session_id: SESSION,
  epoch: 1,
  permission_revision: 1,
  trigger: 'focus',
  allowed_assistance: 'hint',
  presentation: 'silent',
  user_text: null,
  audio_source: null,
  image: { png_base64: 'iVBORw0KGgo=', sha256: 'a'.repeat(64), ...FRAME },
  context: {
    capture_session_id: CAPTURE, frame_seq: 7, frame_captured_at: '2026-10-01T05:00:00.000Z', frame_width: FRAME.width, frame_height: FRAME.height,
    display: { id: '1', bounds: BOUNDS, scale_factor: 2 },
    ...wholeRegions(FRAME, BOUNDS),
    ink_revision: 3, ink_sha256: 'b'.repeat(64), source_url: null, source_version: null, media_position: null,
  },
  focus: focusOf({ x: 10, y: 10, width: 20, height: 10 }, { ...FRAME, seq: 7 }, BOUNDS),
  history: [],
  gaps: [],
  ...o,
});
/** The user's follow-up in their own words, and an unattended look (it asks for no answer), about the same frame. */
const followup = (o: Partial<Turn> = {}): Turn => turn({ request_id: `${SESSION}.7.text_followup`, trigger: 'text_followup', allowed_assistance: 'explain', user_text: 'Why is that?', ...o });
const look = (o: Partial<Turn> = {}): Turn => turn({ request_id: `${SESSION}.7.observation`, trigger: 'observation', allowed_assistance: 'none', presentation: 'none', focus: null, ...o });
/** The user's Start of the AI session (the account must have been checked, and be signed in, before it). */
/** A turn's outcome without `unsettled` (whether its interruption leaves the session unsettled has a test of its own). */
const interrupted = (o: TurnOutcome): object => {
  const { unsettled: _unsettled, ...rest } = o as TurnOutcome & { unsettled?: boolean };
  return rest;
};
const begin = (s: Subscription, o: { session_id?: string; policy?: Policy } = {}): Promise<SessionStart> => s.startSession({ session_id: SESSION, capture_session_id: CAPTURE, policy: POLICY, ...o });
/** A subscription that was checked (signed in, a model that takes pictures) and whose AI session SESSION is running. */
async function started(config: ConnectorConfig = WSL, extra: object = {}, configure?: Parameters<typeof fakeConnectors>[0]) {
  const w = subscription(config, extra, configure);
  await w.s.check();
  const r = await begin(w.s);
  assert.equal(r.ok, true, `the AI session is running (${JSON.stringify(r)})`);
  return { ...w, c: w.fakes.last() };
}
/** Sends `t` and waits until the stand-in connector has it (it holds every turn until the test answers it): how it ends, and its id on the wire. */
async function out(w: { s: Subscription; fakes: { last(): FakeConnector } }, t: Turn = turn()): Promise<{ done: Promise<TurnOutcome>; id: string }> {
  const c = w.fakes.last();
  const n = c.turns().length;
  const done = w.s.turn(t);
  await until(`the turn ${t.request_id} is written`, () => c.turns().length === n + 1);
  return { done, id: c.turns().at(-1)!.id };
}
/** A turn that is not the running session's (stopped, lost with its connector, never started): refused here, and never written. */
const NOT_RUNNING: TurnOutcome = { status: 'refused', code: 'session_stopped', reason: 'the AI session has stopped; start it again to go on', submission: 'not_submitted' };
type Line = Record<string, unknown>;
/** Every line this app writes to a stand-in connector, as it was written (the stand-in itself keeps only the id, the method and the params). */
function wire(c: FakeConnector): Line[] {
  const lines: Line[] = [];
  let rest = '';
  c.stdin.on('data', (b: Buffer) => {
    rest += b.toString('utf8');
    for (let nl = rest.indexOf('\n'); nl >= 0; nl = rest.indexOf('\n')) {
      lines.push(JSON.parse(rest.slice(0, nl)) as Line);
      rest = rest.slice(nl + 1);
    }
  });
  return lines;
}
const SIGNED_OUT = { auth: { state: 'signed_out', mode: null, plan: null }, quota: { available: false, ordinary_usage_allowed: null, windows: [] }, models: [] };
/** Over the bound on one line from the connector (1 MiB in this version), with no line end: the connector is fenced. */
const OVER = 'x'.repeat(LIVE_LINE_FROM_CONNECTOR_MAX + 1);
const UNAVAILABLE = 'the ChatGPT connection is not available';
const local = (reason: string): SessionStart => ({ ok: false, code: 'local', reason });

// ---- the pure rules ---------------------------------------------------------------------------------------------
test('the user\'s words holding half of a surrogate pair are refused, whichever half and wherever; every valid text is kept as it is', () => {
  const DAMAGED = 'the question holds a damaged character (half of a pair), so it cannot be sent as it is; type that part again';
  for (const bad of ['What is \ud83d this?', 'What is \ude00 this?', '\ud83d', 'end \ud83d', '\ude00 start', 'swapped \ude00\ud83d pair', 'two \ud83d\ud83d\ude00 highs']) {
    assert.equal(userTextOf(bad), null, JSON.stringify(bad));
    assert.equal(userTextProblem(bad), DAMAGED);
  }
  // Valid Unicode stays: astral characters, combining marks, other scripts, a pair at either end.
  for (const good of ['What is 😀 this?', '😀', '这道题怎么做？', 'e\u0301 and \u{1F9EE} and \u{10FFFF}', '😀 start and end 😀', 'x'.repeat(3998) + '😀']) assert.equal(userTextOf(`  ${good}  `), good);
  for (const other of ['', '   ', 'x'.repeat(4001), 7]) assert.equal(userTextProblem(other), 'the question is empty or too long');
  assert.equal(userTextProblem('  \ud83d  '), DAMAGED, 'as it is sent: trimmed first');
});

test('a sign-in address is opened only if it is https on openai.com or chatgpt.com (or a subdomain), with no user, password or port', () => {
  for (const ok of [LOGIN_URL, 'https://chatgpt.com/auth/login', 'https://openai.com/x']) assert.equal(officialLoginUrl(ok), new URL(ok).toString());
  for (const bad of ['http://auth.openai.com/x', 'https://auth.openai.com.evil.example/x', 'https://evilopenai.com/x', 'https://user:pw@auth.openai.com/x', 'https://auth.openai.com:8443/x', 'https://localhost/x', 'file:///c:/x', 'javascript:alert(1)', 'not a url', '', 7, `https://auth.openai.com/${'x'.repeat(5000)}`]) {
    assert.equal(officialLoginUrl(bad), null, String(bad).slice(0, 60));
  }
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
    assert.deepEqual([now().state, now().quota, fakes.made.length], ['not_checked', null, 0], 'no child before the user asks for one, and no quota is said before it was read');
    await s.check();
    assert.equal(fakes.made.length, 1);
    const l = fakes.launches[0]!;
    assert.deepEqual([l.command, l.args], ['wsl.exe', ['--distribution', 'Ubuntu', '--user', 'someone', '--cd', '/backend', '--exec', '/backend/.venv/bin/python', '-m', 'services.worker.connectors.chatgpt_local']]);
    assert.deepEqual([l.env['LC_SUBSCRIPTION_STATE_DIR'], l.env['LC_SUBSCRIPTION_CODEX_BIN'], l.env['WSLENV']], ['/product/state', '/opt/codex', 'LC_SUBSCRIPTION_STATE_DIR/u:LC_SUBSCRIPTION_CODEX_BIN/u']);
    assert.deepEqual(Object.keys(l.env).filter((k) => /^(LC_|PG|PYTHON)/i.test(k)).sort(), ['LC_SUBSCRIPTION_CODEX_BIN', 'LC_SUBSCRIPTION_STATE_DIR', 'PYTHONDONTWRITEBYTECODE'], 'only the two trusted settings, from the configuration and not from this process\'s own environment');
    assert.deepEqual((l.options as { stdio: unknown }).stdio, ['pipe', 'pipe', 'ignore'], 'its error output is not read');
    assert.deepEqual(fakes.last().calls.map((c) => [c.method, c.params]), [['connection/read', {}]]);
    assert.deepEqual([now().state, now().plan, now().model], ['signed_in', 'Pro', 'vision-model'], 'the model chosen is one that takes pictures, not the text-only default');
    assert.deepEqual(now().quota, { available: true, ordinary_usage_allowed: true, windows: [bucket()] }, 'the quota as the server states it, bucket by bucket');
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

test('every request is one line of lc-subscription-live/1: its version, an id of its own, its method and its params, and nothing else', async () => {
  let lines: Line[] = [];
  const { s, fakes } = subscription(WSL, {}, (k) => void (lines = wire(k)));
  await s.check();
  await s.login();
  await s.cancelLogin();
  assert.equal((await begin(s)).ok, true);
  const c = fakes.last();
  const sent = turn();
  const done = s.turn(sent);
  await until('sent', () => c.turns().length === 1);
  s.interrupt(sent.request_id);
  await done;
  s.stopSession(SESSION);
  await until('the Stop is told', () => c.count('companion/stop') === 1);
  assert.equal(LIVE_VERSION, 'lc-subscription-live/1');
  const version = 'lc-subscription-live/1';
  assert.deepEqual(lines.map(({ id: _id, ...line }) => line), [
    { version, method: 'connection/read', params: {} },
    { version, method: 'connection/login/start', params: {} },
    { version, method: 'connection/login/cancel', params: { login_id: 'login-1' } },
    { version, method: 'companion/start', params: START },
    { version, method: 'companion/turn', params: sent }, // the turn itself, whole: nothing wrapped around it
    { version, method: 'companion/interrupt', params: { session_id: SESSION, epoch: 1, request_id: sent.request_id } },
    { version, method: 'companion/stop', params: { session_id: SESSION, epoch: 1 } },
  ]);
  const ids = lines.map((l) => l['id']);
  assert.equal(ids.every((id) => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length, true, 'each request has an id of its own');
  assert.deepEqual(c.calls.map((x) => x.id), ids, 'and the stand-in took every one of them as this version\'s');
});

// ---- the AI session (synthetic) ---------------------------------------------------------------------------------
test('Start of the AI session: written once, exactly, with epoch 1, the chosen model and the screen alone; what the connector counts is what is returned', async () => {
  let lines: Line[] = [];
  const { s, fakes, now } = subscription(WSL, {}, (k) => void ((lines = wire(k)), (k.account = { ...ACCOUNT, models: [...ACCOUNT.models, { id: 'vision-model-2', label: 'Vision 2', image_input: true, default: false }] })));
  await s.check();
  const c = fakes.last();
  assert.deepEqual([now().model, s.notStartable(), s.sessionLive(SESSION)], ['vision-model', null, false]);
  // The user's choice of model: only one of the catalog's that takes pictures.
  assert.deepEqual([s.chooseModel('text-only-model'), s.chooseModel('no-such-model'), s.chooseModel(7), now().model], [false, false, false, 'vision-model']);
  assert.deepEqual([s.chooseModel('vision-model-2'), now().model], [true, 'vision-model-2']);
  // The connector counts the session's own bounds: what it says is left is what is returned, never worked out here.
  c.onStart = (r) => void ((r['remaining_submissions'] = 11), (r['expires_in_ms'] = 299_990));
  const start = { ...START, model: 'vision-model-2' };
  assert.deepEqual(await begin(s), { ok: true, start, remaining_submissions: 11, expires_in_ms: 299_990 });
  assert.deepEqual(lines.at(-1), { version: 'lc-subscription-live/1', id: c.calls.at(-1)!.id, method: 'companion/start', params: { session_id: SESSION, capture_session_id: CAPTURE, epoch: 1, model: 'vision-model-2', policy: { max_submissions: 12, max_session_ms: 300_000, min_observation_interval_ms: 30_000 }, permissions: { screen: true, microphone: false, system_audio: false } } });
  assert.deepEqual([c.count('companion/start'), s.sessionLive(SESSION), s.sessionLive(OTHER_SESSION), s.sessionLive(''), fakes.made.length], [1, true, false, false, 1], 'one Start, to the connector whose account was read; only this session is running');
  // The session keeps the model it was started with: a later choice is for the next Start, and an answer from
  // another model than the session's is not this session's.
  assert.equal(s.chooseModel('vision-model'), true);
  const w = { s, fakes };
  const first = await out(w);
  c.answer('From the session\'s model.');
  const answered = await first.done;
  assert.deepEqual([answered.status, answered.status === 'answered' && answered.answer.model], ['answered', 'vision-model-2']);
  const second = await out(w, turn({ request_id: `${SESSION}.7.again` }));
  c.answer('From the model chosen since.', (r) => void (r['model'] = 'vision-model'));
  assert.deepEqual(await second.done, { status: 'refused', code: 'unbound', reason: 'the answer came from another model than the session\'s; it is not shown', submission: 'submitted' });
  // A session whose bounds are already used up as the connector counts them is still that session (zero is a count).
  const used = subscription(WSL, {}, (k) => void (k.onStart = (r) => void ((r['remaining_submissions'] = 0), (r['expires_in_ms'] = 0))));
  await used.s.check();
  assert.deepEqual(await begin(used.s), { ok: true, start: START, remaining_submissions: 0, expires_in_ms: 0 });
});

test('the AI session is not started, and nothing is written, while the account is not checked, being checked, not signed in, not known or not available, with no model that takes pictures, or with a session already running', async () => {
  // Not checked: no connector is started for a Start either (only the user's own Check starts one).
  const idle = subscription();
  assert.equal(idle.s.notStartable(), 'the ChatGPT subscription has not been checked yet (use the control window)');
  assert.deepEqual(await begin(idle.s), local('the ChatGPT subscription has not been checked yet (use the control window)'));
  assert.equal(idle.fakes.made.length, 0);
  // While the account is being read.
  const reading = subscription(WSL, {}, (k) => void (k.account = null));
  const read = reading.s.check();
  await until('read', () => reading.fakes.made.length === 1 && reading.fakes.last().count('connection/read') === 1);
  assert.deepEqual(await begin(reading.s), local('the ChatGPT subscription is being checked'));
  reading.fakes.last().reply(reading.fakes.last().calls[0]!.id, ACCOUNT);
  await read;
  assert.deepEqual([reading.s.notStartable(), reading.fakes.last().count('companion/start')], [null, 0], 'once it is read, the user may start it');
  // As the account reads.
  for (const [account, state, reason] of [
    [SIGNED_OUT, 'signed_out', 'ChatGPT is not signed in (sign in from the control window)'],
    [{ ...ACCOUNT, auth: { state: 'signed_in', mode: 'api_key', plan: null } }, 'signed_out', 'ChatGPT is not signed in (sign in from the control window)'], // an API key is not this subscription
    [{ ...ACCOUNT, auth: { state: 'unknown', mode: null, plan: null } }, 'unknown', 'the sign-in state of the ChatGPT subscription is not known (check it in the control window)'],
    [{ something: 'else' }, 'unavailable', UNAVAILABLE],
    [{ ...ACCOUNT, models: [ACCOUNT.models[0]] }, 'signed_in', 'no model that takes pictures is available'],
    [{ ...ACCOUNT, models: [] }, 'signed_in', 'no model that takes pictures is available'],
  ] as const) {
    const w = subscription(WSL, {}, (k) => void (k.account = account));
    await w.s.check();
    assert.deepEqual([w.now().state, await begin(w.s)], [state, local(reason)], reason);
    assert.deepEqual([w.fakes.last().calls.map((x) => x.method), w.s.sessionLive(SESSION), w.fakes.made.length], [['connection/read'], false, 1], 'nothing but the read was written');
    assert.deepEqual(await w.s.turn(turn()), NOT_RUNNING, 'and no turn either');
    assert.equal(w.fakes.last().turns().length, 0);
  }
  // One session at a time: a second Start (another id, or the same) is not written while one runs, or while one's Start is out.
  const w = await started();
  for (const id of [OTHER_SESSION, SESSION]) assert.deepEqual(await begin(w.s, { session_id: id }), local('an AI session is already running'));
  assert.deepEqual([w.c.count('companion/start'), w.s.sessionLive(SESSION), w.s.sessionLive(OTHER_SESSION)], [1, true, false]);
  const slow = subscription(WSL, {}, (k) => void k.manual.add('companion/start'));
  await slow.s.check();
  const starting = begin(slow.s);
  await until('its Start is out', () => slow.fakes.last().count('companion/start') === 1);
  assert.equal(slow.s.sessionLive(SESSION), false, 'not running before the connector said so');
  assert.deepEqual(await begin(slow.s, { session_id: OTHER_SESSION }), local('an earlier Start of the AI was not answered yet, so this one was not sent; start the AI again in a moment'), 'said as a Start that is still out, never as a session that runs');
  assert.deepEqual(await slow.s.turn(turn()), NOT_RUNNING, 'a turn of a session whose Start is still out is not written');
  slow.fakes.last().reply(slow.fakes.last().calls.at(-1)!.id, STARTED);
  assert.deepEqual([(await starting).ok, slow.fakes.last().count('companion/start'), slow.fakes.last().turns().length, slow.s.sessionLive(SESSION)], [true, 1, 0, true]);
});

test('a Start the connector refuses is said in fixed words, never its message; that session is not running, nothing is written for it, and nothing starts it again but the user', async () => {
  for (const [code, known, reason] of [
    ['busy', 'busy', 'the connector is busy (a sign-in is pending in it, or an earlier request is still being ended), so the AI was not started; try again in a moment'], // a Start's own words, not a turn's
    ['unsupported_model', 'unsupported_model', 'the chosen model is not available for pictures'],
    ['invalid_request', 'invalid_request', 'the connector refused the request as malformed'],
    ['unavailable', 'unavailable', UNAVAILABLE],
    ['allowance_exhausted', 'allowance_exhausted', 'ChatGPT says the account\'s allowance is used up'],
    ['failed', 'failed', 'the request failed'],
    ['quota', 'failed', 'the request failed'], // the earlier envelope's code is not one of this version's
    ['toString', 'failed', 'the request failed'],
  ] as const) {
    const w = subscription(WSL, {}, (k) => void k.manual.add('companion/start'));
    await w.s.check();
    const c = w.fakes.last();
    const starting = begin(w.s);
    await until('its Start is out', () => c.count('companion/start') === 1);
    c.fail(c.calls.at(-1)!.id, code);
    const r = await starting;
    assert.deepEqual(r, { ok: false, code: known, reason }, code);
    assert.equal(JSON.stringify(r).includes('raw message'), false);
    assert.deepEqual([w.s.sessionLive(SESSION), await w.s.turn(turn()), c.turns().length], [false, NOT_RUNNING, 0], 'a session that did not start has no turns');
    await new Promise((r2) => setTimeout(r2, 20));
    assert.deepEqual([c.count('companion/start'), c.count('companion/stop'), w.fakes.made.length, w.now().state, c.exited], [1, 0, 1, 'signed_in', false], 'not started again by itself; the connector said it has no such session, so there is none to stop');
    // The user's own Start again is a new request (here the connector takes it).
    c.manual.delete('companion/start');
    assert.deepEqual([(await begin(w.s, { session_id: OTHER_SESSION })).ok, c.count('companion/start'), w.s.sessionLive(OTHER_SESSION), w.s.sessionLive(SESSION)], [true, 2, true, false]);
  }
  // Refused as not signed in: said as that, and the state follows; the next Start is then refused here, unwritten.
  const signedOut = subscription(WSL, {}, (k) => void k.manual.add('companion/start'));
  await signedOut.s.check();
  const starting = begin(signedOut.s);
  await until('its Start is out', () => signedOut.fakes.last().count('companion/start') === 1);
  signedOut.fakes.last().fail(signedOut.fakes.last().calls.at(-1)!.id, 'unauthenticated');
  assert.deepEqual(await starting, { ok: false, code: 'unauthenticated', reason: 'ChatGPT is not signed in' });
  assert.equal(signedOut.now().state, 'signed_out');
  assert.deepEqual(await begin(signedOut.s), local('ChatGPT is not signed in (sign in from the control window)'));
  assert.equal(signedOut.fakes.last().count('companion/start'), 1);
});

test('a Start answered in a form this app does not read, or not answered at all: that session is not used, and that connector (no other) is told to stop it', async () => {
  const world = async () => {
    const w = subscription(WSL, {}, (k) => void k.manual.add('companion/start'));
    await w.s.check();
    const c = w.fakes.last();
    const starting = begin(w.s);
    await until('its Start is out', () => c.count('companion/start') === 1);
    return { ...w, c, starting, id: c.calls.at(-1)!.id };
  };
  const unused = async (w: Awaited<ReturnType<typeof world>>, what: string): Promise<void> => {
    await until(`the connector is told to stop it (${what})`, () => w.c.count('companion/stop') === 1);
    assert.deepEqual(w.c.calls.at(-1), { id: w.c.calls.at(-1)!.id, method: 'companion/stop', params: { session_id: SESSION, epoch: 1 } }, what);
    assert.deepEqual([w.s.sessionLive(SESSION), await w.s.turn(turn()), w.c.turns().length], [false, NOT_RUNNING, 0], what);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual([w.c.count('companion/start'), w.c.count('companion/stop'), w.fakes.made.length, w.c.exited, w.now().state], [1, 1, 1, false, 'signed_in'], `${what}: said once, to the connector that was asked; not started again, and the connector goes on`);
  };
  for (const result of [
    null, {}, 'started', [STARTED],
    { ...STARTED, session_id: OTHER_SESSION }, // another session's
    { ...STARTED, epoch: 2 },
    { ...STARTED, remaining_submissions: 13 }, // more than the user allowed
    { ...STARTED, expires_in_ms: 300_001 },
    { ...STARTED, remaining_submissions: -1 },
    { ...STARTED, remaining_submissions: 1.5 },
    { ...STARTED, remaining_submissions: '12' },
    { ...STARTED, expires_in_ms: null },
    { ...STARTED, more: true },
    { session_id: SESSION, epoch: 1, remaining_submissions: 12 },
  ]) {
    const w = await world();
    w.c.reply(w.id, result);
    assert.deepEqual(await w.starting, { ok: false, code: 'failed', reason: 'the connector answered the start in a form this app does not read, so that session is not used' }, JSON.stringify(result));
    await unused(w, JSON.stringify(result));
  }
  // No answer within its time: whether the connector started it is not known, so it is stopped there and never used.
  const silent = await world();
  assert.deepEqual(await silent.starting, { ok: false, code: 'unavailable', reason: 'the connector did not answer the start, so that session is not used' });
  await unused(silent, 'no answer');
  // Its answer arriving after all changes nothing: that session stays unused.
  silent.c.reply(silent.id, STARTED);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([silent.s.sessionLive(SESSION), await silent.s.turn(turn()), silent.c.turns().length], [false, NOT_RUNNING, 0]);
  // Positive control: the same world answered as the connector answers is that session, running, and nothing is stopped.
  const fine = await world();
  fine.c.reply(fine.id, STARTED);
  assert.deepEqual(await fine.starting, { ok: true, start: START, remaining_submissions: 12, expires_in_ms: 300_000 });
  assert.deepEqual([fine.s.sessionLive(SESSION), fine.c.count('companion/stop')], [true, 0]);
});

test('the connector lost, fenced or ended by the quit while the AI is being started: that session is not used, whatever was answered, and no other connector is started', async () => {
  const LOST: SessionStart = { ok: false, code: 'unavailable', reason: 'the connector was lost while the AI was being started' };
  const world = async (configure: (k: FakeConnector) => void = () => undefined) => {
    const w = subscription(WSL, {}, (k) => void (k.manual.add('companion/start'), configure(k)));
    await w.s.check();
    const c = w.fakes.last();
    const starting = begin(w.s);
    await until('its Start is out', () => c.count('companion/start') === 1);
    return { ...w, c, starting, id: c.calls.at(-1)!.id };
  };
  const unused = async (w: Awaited<ReturnType<typeof world>>, what: string): Promise<void> => {
    assert.deepEqual([w.s.sessionLive(SESSION), w.s.running(), w.now().state, await w.s.turn(turn()), await begin(w.s)], [false, false, 'unavailable', NOT_RUNNING, local(UNAVAILABLE)], what);
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual([w.fakes.made.length, w.c.count('companion/start'), w.c.turns().length], [1, 1, 0], `${what}: no other connector, no second Start, no turn`);
  };
  // It ends while the Start is out.
  const gone = await world();
  gone.c.exit(1);
  assert.deepEqual(await gone.starting, LOST);
  await unused(gone, 'ended');
  // It answers the Start as it should, and is fenced in the same chunk (a line that is not the envelope's).
  const fenced = await world();
  fenced.c.stdout.write(`${JSON.stringify({ id: fenced.id, result: STARTED })}\n${OVER}`);
  assert.deepEqual(await fenced.starting, LOST, 'what it answered is not taken as a running session');
  await unused(fenced, 'fenced');
  // It refuses the Start as not signed in, and is fenced in the same chunk: not said as signed out.
  const refused = await world();
  const from = refused.said.length;
  refused.c.stdout.write(`${JSON.stringify({ id: refused.id, error: { code: 'unauthenticated', submission: 'not_submitted', message: 'raw' } })}\n${OVER}`);
  assert.deepEqual(await refused.starting, LOST);
  assert.equal(refused.said.slice(from).some((x) => x.mode === 'managed' && x.state === 'signed_out'), false);
  await unused(refused, 'refused and fenced');
  // The app quits while the Start is out, and the connector still answers it before it ends.
  const q = await world((k) => void (k.endDelayMs = 80));
  const quit = q.s.quit();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(q.c.exited, false, 'still ending');
  q.c.stdout.write(`${JSON.stringify({ id: q.id, result: STARTED })}\n`);
  assert.deepEqual(await q.starting, LOST);
  await quit;
  assert.equal(q.c.exited, true);
  await unused(q, 'quit');
  // Only the user's own Check starts a connector again, and only the user's own Start a session in it.
  await gone.s.check();
  assert.deepEqual([gone.fakes.made.length, gone.now().state, gone.s.sessionLive(SESSION), gone.fakes.last().calls.map((x) => x.method)], [2, 'signed_in', false, ['connection/read']]);
  gone.fakes.last().manual.delete('companion/start'); // this one answers its Start by itself
  assert.deepEqual([(await begin(gone.s)).ok, gone.s.sessionLive(SESSION), gone.fakes.last().count('companion/start'), gone.c.count('companion/start')], [true, true, 1, 1]);
});

// ---- the session's turns (synthetic) ----------------------------------------------------------------------------
test('one turn: sent once in the envelope as the turn itself; its bound answer is returned, as submitted; an unattended look\'s answer is an observation', async () => {
  const w = await started();
  const { s, c, now, said } = w;
  const sent = turn();
  assert.equal(turnProblem(sent, Buffer.from(sent.image.png_base64, 'base64').length), null, 'a turn as the app builds one');
  const from = said.length;
  const done = s.turn(sent);
  await until('sent', () => c.turns().length === 1);
  assert.equal(now().asking, true);
  assert.deepEqual(c.turns()[0]!.params, sent, 'the whole turn is the request\'s params: the whole display\'s picture, its context, the focus, and the model nowhere (it is the session\'s)');
  c.answer('It is a right triangle.');
  assert.deepEqual(await done, { status: 'answered', answer: { request_id: sent.request_id, text: 'It is a right triangle.', model: 'vision-model', latency_ms: 1234, thread_id: 'thread-synthetic-1', turn_id: 'turn-synthetic-1', kind: 'generated_assistance' }, submission: 'submitted' });
  assert.deepEqual([now().asking, c.turns().length], [false, 1]);
  assert.deepEqual(said.slice(from).map((x) => x.mode === 'managed' && x.asking), [true, false], 'the windows are told that a turn is out, and that it is over');
  // An unattended look asks for no answer to show: what comes back is an observation, and is said as one.
  const seen = look();
  assert.equal(turnProblem(seen, 8), null);
  const looking = await out(w, seen);
  assert.deepEqual(c.looks().map((x) => x.params), [seen]);
  c.see('A page with a triangle and two marked sides.');
  assert.deepEqual(await looking.done, { status: 'answered', answer: { request_id: seen.request_id, text: 'A page with a triangle and two marked sides.', model: 'vision-model', latency_ms: 1234, thread_id: 'thread-synthetic-1', turn_id: 'turn-synthetic-1', kind: 'observation' }, submission: 'submitted' });
  // An answer of the other kind is not what was asked for: generated help for a look, or an observation for the user's own request.
  const again = await out(w, look({ request_id: `${SESSION}.7.observation.2` }));
  c.see('Here is a hint for you.');
  assert.equal((await again.done).status, 'answered', '(the control: a look answered as a look)');
  const helped = await out(w, look({ request_id: `${SESSION}.7.observation.3` }));
  c.answer('Here is a hint for you.', (r) => void (r['kind'] = 'generated_assistance'), c.looks().at(-1)!);
  assert.deepEqual(await helped.done, { status: 'refused', code: 'unbound', reason: 'the answer is not of the kind that was asked for; it is not shown', submission: 'submitted' });
  assert.equal(c.turns().length, 4, 'each was sent once');
});

test('several turns may be out at once (this app no longer holds one back; the connector says busy): each is written once and ends as its own answer says', async () => {
  const w = await started();
  const { s, c, now } = w;
  const [a, b, d] = [turn(), followup(), look()];
  assert.deepEqual([a, b, d].map((t) => turnProblem(t, 8)), [null, null, null]);
  const outs = [await out(w, a), await out(w, b), await out(w, d)] as const;
  assert.deepEqual([c.turns().map((t) => t.params['request_id']), now().asking], [[a.request_id, b.request_id, d.request_id], true], 'all three were written, in the order they were sent');
  // The connector's own word on the second, as it refuses one while another is in flight; the others are still out.
  c.fail(outs[1].id, 'busy');
  assert.deepEqual(await outs[1].done, { status: 'refused', code: 'busy', reason: 'another request of yours is still waiting, so this one was not taken', submission: 'not_submitted' });
  assert.equal(now().asking, true);
  // Answered out of order: each answer is its own turn's.
  c.see('A page with a triangle.');
  assert.deepEqual(await outs[2].done, { status: 'answered', answer: { request_id: d.request_id, text: 'A page with a triangle.', model: 'vision-model', latency_ms: 1234, thread_id: 'thread-synthetic-1', turn_id: 'turn-synthetic-1', kind: 'observation' }, submission: 'submitted' });
  assert.equal(now().asking, true, 'the first is still out');
  c.answer('Look at the longest side.', undefined, c.turns()[0]!);
  const first = await outs[0].done;
  assert.deepEqual([first.status, first.status === 'answered' && first.answer.request_id, first.status === 'answered' && first.answer.text], ['answered', a.request_id, 'Look at the longest side.']);
  assert.deepEqual([now().asking, c.turns().length, c.count('companion/interrupt')], [false, 3, 0], 'nothing was sent again, and nothing was interrupted to make room');
  // An answer made for one turn and written under another's id is not that other's; the one it was made for still waits.
  const [e, f] = [turn({ request_id: `${SESSION}.9.focus` }), followup({ request_id: `${SESSION}.9.text_followup` })];
  const [one, two] = [await out(w, e), await out(w, f)];
  c.answer('For the follow-up.', undefined, { ...c.turns().at(-1)!, id: one.id });
  assert.deepEqual(await one.done, { status: 'refused', code: 'unbound', reason: 'the answer is for another request; it is not shown', submission: 'submitted' });
  assert.equal(now().asking, true);
  c.answer('For the follow-up.');
  assert.equal((await two.done).status, 'answered');
  assert.deepEqual([now().asking, c.turns().length], [false, 5]);
});

test('an answer not bound to what was sent is not returned; the connector\'s errors are fixed texts and its own word on whether ChatGPT was reached, never its message; nothing is sent again', async () => {
  const w = await started();
  const { s, c, now } = w;
  let o = await out(w);
  c.answer('An answer about another picture.', (r) => void ((r['provenance'] as { image: { sha256: string } }).image.sha256 = 'c'.repeat(64)));
  assert.deepEqual(await o.done, { status: 'refused', code: 'unbound', reason: 'the answer is not bound to the request that was sent; it is not shown', submission: 'submitted' });
  // Every code of this version that refuses a turn (the two that say it was cancelled, and the sign-in's, are below).
  const SAID: Record<string, string> = {
    allowance_exhausted: 'ChatGPT says the account\'s allowance is used up',
    rate_limited: 'ChatGPT says requests are coming too fast for now (a rate limit, not a used-up allowance)',
    allowance_unknown: 'ChatGPT refused the request, and what is left of the allowance is not known',
    workspace_limit: 'ChatGPT says a workspace limit was reached',
    ordinary_usage_not_allowed: 'ChatGPT says included usage is not allowed for this request now',
    unsupported_model: 'the chosen model is not available for pictures',
    budget_reached: 'this session\'s own bound (requests or time) was reached',
    failed: 'the request failed',
    quota: 'the request failed', // the earlier envelope's code is not one of this version's: not known, so only "failed"
    some_new_code: 'the request failed',
  };
  const codes = [...Object.keys(LIVE_ERROR_TEXT).filter((k) => !['cancelled', 'unauthenticated'].includes(k)), 'quota', 'some_new_code'];
  assert.equal(Object.keys(SAID).every((k) => codes.includes(k)), true);
  for (const [i, code] of codes.entries()) {
    const submission = (['not_submitted', 'submitted', 'unknown'] as const)[i % 3]!;
    const n = c.turns().length;
    o = await out(w, turn({ request_id: `${SESSION}.x.${n}` }));
    c.fail(o.id, code, submission);
    const known = Object.hasOwn(LIVE_ERROR_TEXT, code) ? code : 'failed';
    const outcome = await o.done;
    assert.deepEqual(outcome, { status: 'refused', code: known, reason: SAID[code] ?? LIVE_ERROR_TEXT[code], submission }, code);
    assert.equal(typeof (outcome as { reason?: unknown }).reason === 'string' && !JSON.stringify(outcome).includes('raw message'), true, code);
    assert.equal(c.turns().length, n + 1, 'not sent again');
  }
  assert.deepEqual([now().state, s.sessionLive(SESSION), c.count('companion/stop'), c.count('companion/interrupt')], ['signed_in', true, 0, 0], 'the transport only says how each ended: whether the session goes on after a failure is the main process\'s to decide');
  // Not signed in any more: said, and the state follows; a Start is then refused here.
  const n = c.turns().length;
  o = await out(w, turn({ request_id: `${SESSION}.y.1` }));
  c.fail(o.id, 'unauthenticated');
  assert.deepEqual(await o.done, { status: 'refused', code: 'unauthenticated', reason: 'ChatGPT is not signed in', submission: 'not_submitted' });
  assert.equal(now().state, 'signed_out');
  assert.deepEqual(await begin(s, { session_id: OTHER_SESSION }), local('ChatGPT is not signed in (sign in from the control window)'));
  // The session that was refused so is ended by the app (a failure that is not simply "not taken"): nothing of it is sent then.
  s.stopSession(SESSION);
  assert.deepEqual(await s.turn(turn({ request_id: `${SESSION}.z.1` })), NOT_RUNNING);
  assert.deepEqual([c.turns().length, c.count('companion/start')], [n + 1, 1], 'nothing is sent while signed out');
});

test('whether a turn reached ChatGPT is said with every outcome: the connector\'s own word when it gave one, "unknown" when it gave none this app knows, and "not_submitted" for what was never written', async () => {
  const w = await started();
  const { s, c, now } = w;
  // The connector's word, read strictly: another word, or none, is "unknown" (which counts like "submitted").
  for (const [error, submission] of [
    [{ code: 'rate_limited', submission: 'submitted', message: 'raw' }, 'submitted'],
    [{ code: 'rate_limited', submission: 'not_submitted' }, 'not_submitted'],
    [{ code: 'rate_limited', submission: 'unknown' }, 'unknown'],
    [{ code: 'rate_limited' }, 'unknown'],
    [{ code: 'rate_limited', submission: 'maybe' }, 'unknown'],
    [{ code: 'rate_limited', submission: false }, 'unknown'],
    [{ code: 'rate_limited', submission: ['not_submitted'] }, 'unknown'],
    [{ code: 'rate_limited', submission: 'constructor' }, 'unknown'],
  ] as const) {
    const o = await out(w, turn({ request_id: `${SESSION}.s.${c.turns().length}` }));
    c.stdout.write(`${JSON.stringify({ id: o.id, error })}\n`);
    assert.deepEqual(await o.done, { status: 'refused', code: 'rate_limited', reason: 'ChatGPT says requests are coming too fast for now (a rate limit, not a used-up allowance)', submission }, JSON.stringify(error));
  }
  // An interrupted turn: the connector's word too (one it had not sent on yet was not submitted).
  c.onCancel = 'silent'; // the test ends the turn by hand
  const queued = turn({ request_id: `${SESSION}.s.queued` });
  let o = await out(w, queued);
  s.interrupt(queued.request_id);
  c.fail(o.id, 'cancelled', 'not_submitted');
  assert.deepEqual(interrupted(await o.done), { status: 'cancelled', uncertain: false, submission: 'not_submitted' });
  // Never written, so never submitted: a turn too large for one line to the connector ...
  const written = c.turns().length;
  const large = turn({ request_id: `${SESSION}.s.large`, image: { ...turn().image, png_base64: 'A'.repeat(LINE_TO_CONNECTOR_MAX) } });
  assert.deepEqual(await s.turn(large), { status: 'refused', code: 'context_limit', reason: 'the request or its answer is too large', submission: 'not_submitted' });
  assert.deepEqual([c.turns().length, now().asking, s.sessionLive(SESSION)], [written, false, true], 'nothing of it was written, and the session goes on');
  // ... a turn of another session than the running one, or of one that was never started ...
  assert.deepEqual(await s.turn(turn({ session_id: OTHER_SESSION })), NOT_RUNNING);
  const never = subscription();
  assert.deepEqual([await never.s.turn(turn()), never.fakes.made.length], [NOT_RUNNING, 0], 'no connector is started for a turn');
  // ... and one the connector's input did not take.
  c.stdin.destroy();
  assert.deepEqual(await s.turn(turn({ request_id: `${SESSION}.s.pipe` })), { status: 'refused', code: 'unavailable', reason: 'the connector could not be reached, so nothing was sent', submission: 'not_submitted' });
  assert.deepEqual([c.turns().length, now().asking, w.fakes.made.length], [written, false, 1]);
});

test('interrupt: the turn is interrupted and its answer never returned, whatever arrives; whether it stopped is what the interrupt was answered', async () => {
  for (const [mode, uncertain] of [['confirmed', false], ['unconfirmed', true]] as const) {
    const w = await started();
    w.c.onCancel = mode;
    const sent = turn();
    const { done } = await out(w, sent);
    w.s.interrupt(sent.request_id);
    // As the released connector answers: the turn as `cancelled`; the uncertainty in the interrupt's own answer.
    assert.deepEqual(interrupted(await done), { status: 'cancelled', uncertain, submission: 'submitted' });
    assert.deepEqual(w.c.calls.at(-1), { id: w.c.calls.at(-1)!.id, method: 'companion/interrupt', params: { session_id: SESSION, epoch: 1, request_id: sent.request_id } });
    assert.deepEqual([w.s.sessionLive(SESSION), w.now().asking], [true, false], 'the session itself goes on');
  }
  // The answer arrives although it was interrupted (the interruption raced it): it is not returned.
  const w = await started();
  w.c.onCancel = 'silent';
  const sent = turn();
  const { done } = await out(w, sent);
  w.s.interrupt(sent.request_id);
  w.c.answer('A late answer.');
  const outcome = await done;
  assert.deepEqual(interrupted(outcome), { status: 'cancelled', uncertain: true, submission: 'submitted' });
  assert.equal(JSON.stringify(outcome).includes('late answer'), false);
  // An interrupt that gets no answer at all (the connector hangs) is not a confirmed stop either.
  const hung = await started();
  const asked = await out(hung);
  hung.c.stdin.removeAllListeners('data'); // it reads nothing more
  hung.s.interrupt(turn().request_id);
  assert.deepEqual(interrupted(await asked.done), { status: 'cancelled', uncertain: true, submission: 'unknown' });
});

test('an interrupt names its own turn: only that one is interrupted; the others go on and are answered; one that is not out, or already interrupted, writes nothing', async () => {
  const w = await started();
  const { s, c, now } = w;
  const [a, b, d] = [turn(), followup(), look()];
  const outs = [await out(w, a), await out(w, b), await out(w, d)] as const;
  const interrupts = () => c.calls.filter((x) => x.method === 'companion/interrupt').map((x) => x.params);
  s.interrupt(b.request_id);
  assert.deepEqual(interrupted(await outs[1].done), { status: 'cancelled', uncertain: false, submission: 'submitted' });
  assert.deepEqual(interrupts(), [{ session_id: SESSION, epoch: 1, request_id: b.request_id }], 'by its request id, in its session and epoch: never "whatever is current"');
  assert.equal(now().asking, true, 'the other two are still out');
  // Not out (never sent, another session's, already over): nothing is written.
  for (const id of [b.request_id, 'live-0123456789abcdef.99.focus', '', OTHER_SESSION]) s.interrupt(id);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(interrupts().length, 1);
  c.see('A page with a triangle.');
  c.answer('Look at the longest side.', undefined, c.turns()[0]!);
  assert.deepEqual([(await outs[0].done).status, (await outs[2].done).status], ['answered', 'answered'], 'the others were not touched by it');
  s.interrupt(a.request_id); // over already
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([interrupts().length, c.turns().length, s.sessionLive(SESSION)], [1, 3, true]);
  // Pressed twice while it is still out: told once.
  c.onCancel = 'silent';
  const held = turn({ request_id: `${SESSION}.9.focus` });
  const last = await out(w, held);
  s.interrupt(held.request_id);
  s.interrupt(held.request_id);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(interrupts().slice(1), [{ session_id: SESSION, epoch: 1, request_id: held.request_id }]);
  c.fail(last.id, 'cancelled', 'submitted');
  assert.deepEqual(interrupted(await last.done), { status: 'cancelled', uncertain: false, submission: 'submitted' });
  // With no session at all, and no connector: nothing is started for an interrupt.
  const idle = subscription();
  idle.s.interrupt(a.request_id);
  assert.equal(idle.fakes.made.length, 0);
});

test('a stopped AI session can never send again: the connector is told once, every turn of it that is out is interrupted and none returned, and only the user\'s new Start goes on', async () => {
  const w = await started();
  const { s, c, now } = w;
  const outs = [await out(w, turn()), await out(w, followup()), await out(w, look())] as const;
  const stops = () => c.calls.filter((x) => x.method === 'companion/stop').map((x) => x.params);
  // Another session's Stop is not this one's.
  s.stopSession(OTHER_SESSION);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([stops(), s.sessionLive(SESSION), now().asking], [[], true, true]);
  s.stopSession(SESSION);
  assert.equal(s.sessionLive(SESSION), false, 'from this moment, before the connector answered');
  // As the released connector ends them: each turn as `session_stopped`; the Stop's own receipt says they were interrupted.
  for (const o of outs) assert.deepEqual(interrupted(await o.done), { status: 'cancelled', uncertain: false, submission: 'submitted' });
  assert.deepEqual([stops(), c.count('companion/interrupt'), now().asking], [[{ session_id: SESSION, epoch: 1 }], 0, false], 'the Stop itself interrupts them: no interrupt of each is written');
  // Told once; and nothing of that session is written afterwards.
  s.stopSession(SESSION);
  s.interrupt(turn().request_id);
  assert.deepEqual(await s.turn(turn({ request_id: `${SESSION}.9.after` })), NOT_RUNNING);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([stops().length, c.count('companion/interrupt'), c.turns().length, now().state, c.exited], [1, 0, 3, 'signed_in', false], 'the connector and the sign-in are as they were');
  // Another session, the user's explicit new Start, can send; the stopped one still cannot.
  assert.deepEqual(await begin(s, { session_id: OTHER_SESSION }), { ok: true, start: { ...START, session_id: OTHER_SESSION }, remaining_submissions: 12, expires_in_ms: 300_000 });
  const next = await out(w, turn({ request_id: `${OTHER_SESSION}.1.focus`, session_id: OTHER_SESSION }));
  c.answer('For the new session.');
  assert.equal((await next.done).status, 'answered');
  assert.deepEqual([await s.turn(turn({ request_id: `${SESSION}.9.again` })), c.turns().length, s.sessionLive(SESSION), s.sessionLive(OTHER_SESSION)], [NOT_RUNNING, 4, false, true]);
  s.stopSession(SESSION); // the stopped one's Stop again does not stop the new one
  assert.deepEqual([s.sessionLive(OTHER_SESSION), stops().length], [true, 1]);
  // An answer that arrives after the Stop is not returned, and a Stop that was not confirmed is said as that.
  const late = await started();
  late.c.onCancel = 'silent';
  late.c.stopReceipt = { result: { cancelled: true, uncertain: true } };
  const sent = await out(late);
  late.s.stopSession(SESSION);
  await until('told', () => late.c.count('companion/stop') === 1);
  assert.deepEqual(late.c.calls.at(-1), { id: late.c.calls.at(-1)!.id, method: 'companion/stop', params: { session_id: SESSION, epoch: 1 } });
  late.c.answer('An answer after the Stop.');
  const outcome = await sent.done;
  assert.deepEqual(interrupted(outcome), { status: 'cancelled', uncertain: true, submission: 'submitted' }, 'not shown; the Stop\'s interruption was not confirmed, and that is said');
  assert.equal(JSON.stringify(outcome).includes('after the Stop'), false);
  // A turn that never ends after the Stop: given up at its own bound, not said as stopped for certain, and no
  // interrupt of it is written to a session that was stopped (the Stop told the connector already).
  const never = await started();
  never.c.onCancel = 'silent';
  const unanswered = await out(never);
  never.s.stopSession(SESSION);
  assert.deepEqual(interrupted(await unanswered.done), { status: 'cancelled', uncertain: true, submission: 'unknown' });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([never.c.count('companion/stop'), never.c.count('companion/interrupt')], [1, 0]);
  // A session with nothing out is told as well; one stopped before any child ran starts none.
  const quiet = await started();
  quiet.s.stopSession(SESSION);
  await until('told', () => quiet.c.count('companion/stop') === 1);
  assert.deepEqual([quiet.s.sessionLive(SESSION), await quiet.s.turn(turn()), quiet.c.turns().length], [false, NOT_RUNNING, 0]);
  const idle = subscription();
  idle.s.stopSession(SESSION);
  assert.equal(idle.fakes.made.length, 0);
});

test('no answer in time, or the connector lost: said as not known, the turn interrupted, and never sent again', async () => {
  const w = await started();
  const { s, fakes, now, c } = w;
  c.onCancel = 'silent';
  const sent = turn();
  const done = s.turn(sent);
  await until('sent', () => c.turns().length === 1);
  assert.deepEqual(await done, { status: 'uncertain', reason: 'no answer came; whether ChatGPT worked on it is not known', submission: 'unknown' });
  assert.deepEqual([c.turns().length, c.calls.at(-1)], [1, { id: c.calls.at(-1)!.id, method: 'companion/interrupt', params: { session_id: SESSION, epoch: 1, request_id: sent.request_id } }]);
  // Its answer arriving after it was given up is not anyone's: dropped.
  c.answer('Too late.');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(now().asking, false);
  // The connector ends while a turn is out.
  const lost = await out(w, turn({ request_id: `${SESSION}.8.lost` }));
  c.exit(1);
  assert.deepEqual(await lost.done, { status: 'uncertain', reason: 'no answer came; whether ChatGPT worked on it is not known', submission: 'unknown' });
  assert.deepEqual([now().state, s.sessionLive(SESSION), s.running()], ['unavailable', false, false], 'its session went with it');
  assert.deepEqual(await s.turn(turn({ request_id: `${SESSION}.8.next` })), NOT_RUNNING);
  assert.deepEqual(await begin(s, { session_id: OTHER_SESSION }), local(UNAVAILABLE));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fakes.made.length, 1, 'no new connector is started by the app itself (not even to interrupt what the lost one had)');
  // Only the user's own Check starts one again; the lost connector's session is not a session of the new one.
  await s.check();
  assert.deepEqual([fakes.made.length, now().state, s.sessionLive(SESSION)], [2, 'signed_in', false]);
  assert.deepEqual(await s.turn(turn({ request_id: `${SESSION}.8.new-connector` })), NOT_RUNNING);
  s.interrupt(sent.request_id);
  s.stopSession(SESSION); // the app ends what it had (the connection was lost): told to the connector that had it, which is gone
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(fakes.last().calls.map((x) => x.method), ['connection/read'], 'nothing of the old session is written to the new connector: no turn, no interrupt, no Stop');
  // The user's own Start there is a new session.
  assert.deepEqual([(await begin(s, { session_id: OTHER_SESSION })).ok, s.sessionLive(OTHER_SESSION), fakes.last().count('companion/start'), c.count('companion/start')], [true, true, 1, 1]);
  s.stopSession(SESSION);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([fakes.last().count('companion/stop'), s.sessionLive(OTHER_SESSION)], [0, true], 'the lost session\'s Stop is not the new one\'s');
  // A session lost with its connector does not count as running: without any Stop of it, the user's Start in the next connector is taken.
  const next = await started();
  next.c.exit(1);
  await next.s.check();
  assert.deepEqual([next.fakes.made.length, next.s.notStartable(), (await begin(next.s, { session_id: OTHER_SESSION })).ok, next.s.sessionLive(SESSION), next.s.sessionLive(OTHER_SESSION)], [2, null, true, false, true]);
  // A turn given up while its connector had already gone: the same, no new child.
  const gone = await started();
  const asked = await out(gone);
  gone.c.exit(1);
  await asked.done;
  gone.s.interrupt(turn().request_id);
  gone.s.stopSession(SESSION);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual([gone.fakes.made.length, gone.c.count('companion/interrupt'), gone.c.count('companion/stop')], [1, 0, 0]);
});

test('the quit: the turns that are out are never returned and not said as stopped for certain, the session can never send again, and the connector is ended by the end of its input', async () => {
  const w = await started(WSL, {}, (k) => void (k.endDelayMs = 80));
  const { s, c, now, fakes } = w;
  let kills = 0;
  const kill = c.kill.bind(c);
  c.kill = () => (kills++, kill());
  const outs = [await out(w, turn()), await out(w, look())] as const;
  const quitting = s.quit();
  assert.deepEqual([s.sessionLive(SESSION), s.running(), now().detail], [false, false, 'the app is closing: the connector is being ended']);
  // The connector still answers one of them before it ends (the released one closes its own child first): not read.
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(c.exited, false, 'still ending');
  c.answer('An answer while the app quits.');
  for (const o of outs) {
    const outcome = await o.done;
    assert.deepEqual(interrupted(outcome), { status: 'cancelled', uncertain: true, submission: 'unknown' }, 'no receipt of an interruption was read, and whether ChatGPT worked on it is not known');
    assert.equal(JSON.stringify(outcome).includes('while the app quits'), false);
  }
  await quitting;
  assert.deepEqual([c.exited, kills, now().asking, now().state, now().detail], [true, 0, false, 'unavailable', null], 'ended by itself at the end of its input');
  // After the quit nothing is sent or started.
  assert.deepEqual([await s.turn(turn({ request_id: `${SESSION}.9.after` })), await begin(s, { session_id: OTHER_SESSION }), s.sessionLive(SESSION)], [NOT_RUNNING, local(UNAVAILABLE), false]);
  s.interrupt(turn().request_id);
  s.stopSession(SESSION);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([fakes.made.length, c.turns().length], [1, 2]);
  // A quit with a session running and nothing out, and a quit before anything was started: both simply end.
  const quiet = await started();
  await quiet.s.quit();
  assert.deepEqual([quiet.c.exited, quiet.s.sessionLive(SESSION), quiet.now().detail], [true, false, null]);
  const idle = subscription();
  await idle.s.quit();
  assert.deepEqual([idle.fakes.made.length, idle.now().state, idle.now().detail], [0, 'not_checked', null]);
});

test('a connector that cannot be started, answers in another form, or writes a line over the bound is said as not available; a line of exactly the bound (1 MiB) is read', async () => {
  const none = subscription(WSL, { spawn: (() => spawn(path.join('/nonexistent', `lc-no-connector-${process.pid}`), [], { stdio: ['pipe', 'pipe', 'ignore'] })) as never });
  await none.s.check();
  assert.deepEqual([none.now().state, none.now().detail], ['unavailable', 'the connector could not be started']);
  const odd = subscription(WSL, {}, (c) => void (c.account = { something: 'else' }));
  await odd.s.check();
  assert.deepEqual([odd.now().state, odd.now().detail], ['unavailable', 'the connector answered in a form this app does not read']);
  // The earlier envelope's account (rate_limits, no quota) is another form too: nothing is guessed from it.
  const earlier = subscription(WSL, {}, (c) => void (c.account = { auth: ACCOUNT.auth, rate_limits: null, models: ACCOUNT.models }));
  await earlier.s.check();
  assert.deepEqual([earlier.now().state, earlier.now().detail, earlier.now().quota, earlier.now().model], ['unavailable', 'the connector answered in a form this app does not read', null, null]);
  // One line from the connector may be up to 1 MiB in this version: an account read of exactly that many bytes is read
  // (what it holds besides the account is not kept), and the connector goes on.
  assert.equal(LIVE_LINE_FROM_CONNECTOR_MAX, 1024 * 1024);
  const read = (id: string, bytes: number): string => {
    const line = (pad: string): string => JSON.stringify({ id, result: { ...ACCOUNT, pad } });
    return line('y'.repeat(bytes - Buffer.byteLength(line(''))));
  };
  const full = subscription(WSL, {}, (c) => void (c.account = null)); // this test answers by hand
  const reading = full.s.check();
  await until('asked', () => full.fakes.made.length === 1 && full.fakes.last().count('connection/read') === 1);
  const exact = read(full.fakes.last().calls[0]!.id, LIVE_LINE_FROM_CONNECTOR_MAX);
  assert.equal(Buffer.byteLength(exact), 1024 * 1024);
  full.fakes.last().stdout.write(`${exact}\n`);
  await reading;
  assert.deepEqual([full.now().state, full.now().plan, full.s.running(), full.fakes.last().exited, JSON.stringify(full.now()).includes('yyyy')], ['signed_in', 'Pro', true, false, false]);
  // The same when the line's end comes in a later chunk: a line that is whole so far, at exactly the bound, is still one line.
  const rereading = full.s.check();
  await until('asked again', () => full.fakes.last().count('connection/read') === 2);
  full.fakes.last().stdout.write(read(full.fakes.last().calls[1]!.id, LIVE_LINE_FROM_CONNECTOR_MAX).replace('"Pro"', '"Max"'));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([full.now().state, full.s.running()], ['checking', true], 'not ended, and not read before its end');
  full.fakes.last().stdout.write('\n');
  await rereading;
  assert.deepEqual([full.now().state, full.now().plan, full.s.running()], ['signed_in', 'Max', true]);
  // A line of one byte more: the child is ended; nothing of the line is kept, though it is an account read's answer.
  const long = subscription(WSL, {}, (c) => void (c.account = null));
  const over = long.s.check();
  await until('asked', () => long.fakes.made.length === 1 && long.fakes.last().count('connection/read') === 1);
  long.fakes.last().stdout.write(`${read(long.fakes.last().calls[0]!.id, LIVE_LINE_FROM_CONNECTOR_MAX + 1)}\n`);
  await over;
  await until('ended', () => long.fakes.last().exited);
  assert.deepEqual([long.now().state, long.now().plan, long.now().models, long.s.running()], ['unavailable', null, [], false]);
  // The same for a line that has not ended yet, in a connector with a session running: its session goes with it.
  const live = await started();
  live.c.stdout.write(`{"method":"x","params":"${'y'.repeat(LIVE_LINE_FROM_CONNECTOR_MAX)}`);
  await until('ended', () => live.c.exited);
  assert.deepEqual([live.now().state, live.s.sessionLive(SESSION), await live.s.turn(turn()), live.c.turns().length], ['unavailable', false, NOT_RUNNING, 0]);
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
  const w = await started();
  const { c } = w;
  const sent = turn();
  let o = await out(w, sent);
  c.fail(o.id, 'toString');
  assert.deepEqual(await o.done, { status: 'refused', code: 'failed', reason: 'the request failed', submission: 'not_submitted' });
  // The same for what it says of the request's fate: a word named like a built-in is not one of the three.
  o = await out(w, turn({ request_id: `${SESSION}.7.built-in` }));
  c.fail(o.id, '__proto__', 'hasOwnProperty');
  assert.deepEqual(await o.done, { status: 'refused', code: 'failed', reason: 'the request failed', submission: 'unknown' });
  // A provenance with a fact missing and "__proto__" in its place is not the turn's.
  const answered = (t: Turn, id: string, provenance: string): string => `{"id":${JSON.stringify(id)},"result":{"request_id":${JSON.stringify(t.request_id)},"text":"x","provenance":${provenance},"model":"vision-model","auth_mode":"chatgpt","latency_ms":1,"thread_id":"t","turn_id":"u","kind":"generated_assistance"}}\n`;
  const proto = turn({ request_id: `${SESSION}.7.proto` });
  o = await out(w, proto);
  const whole = JSON.stringify(provenanceOf(c.turns().at(-1)!.params as unknown as Turn));
  const swapped = whole.replace('"media_position":null', '"__proto__":{}');
  assert.notEqual(swapped, whole);
  c.stdout.write(answered(proto, o.id, swapped));
  assert.deepEqual(await o.done, { status: 'refused', code: 'unbound', reason: 'the answer is not bound to the request that was sent; it is not shown', submission: 'submitted' });
  // Positive control: the same line with the provenance as it was sent is that turn's answer.
  const plain = turn({ request_id: `${SESSION}.7.plain` });
  o = await out(w, plain);
  c.stdout.write(answered(plain, o.id, JSON.stringify(provenanceOf(plain))));
  assert.deepEqual(await o.done, { status: 'answered', answer: { request_id: plain.request_id, text: 'x', model: 'vision-model', latency_ms: 1, thread_id: 't', turn_id: 'u', kind: 'generated_assistance' }, submission: 'submitted' });
  // An answer of 32,000 characters that are each two UTF-16 units is within the bound, as the connector counts it.
  const result = (text: string): unknown => ({ request_id: sent.request_id, text, provenance: provenanceOf(sent), model: 'vendor/model 1', auth_mode: 'chatgpt', latency_ms: 2.5, thread_id: 't', turn_id: 'u', kind: 'generated_assistance' });
  assert.equal(RESULT_TEXT_MAX, 32_000);
  assert.equal(typeof readLiveResult(result('𝑥'.repeat(RESULT_TEXT_MAX)), sent, 'vendor/model 1'), 'object');
  assert.equal(readLiveResult(result('𝑥'.repeat(RESULT_TEXT_MAX + 1)), sent, 'vendor/model 1'), 'the answer is too long to show');
  // A child that could not be given its pipes is not started; nothing is thrown.
  const none = subscription(WSL, { spawn: (() => Object.assign(new (await_emitter())(), { pid: undefined, stdin: null, stdout: null, kill: () => true })) as never });
  await none.s.check();
  assert.deepEqual([none.now().state, none.now().detail], ['unavailable', 'the connector could not be started']);
});

test('a change, or a completed sign-in, said while the account is being read is read once more: the newer state stands, and nothing but reads is sent', async () => {
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
  assert.deepEqual(c.calls.map((x) => x.method), ['connection/login/start', 'connection/read', 'connection/read'], 'no sign-in, no AI session and no turn was started by it');
  assert.equal(opened.length, 1, 'only the page the user\'s own press opened');
  // A change during a read after a plain Check: the same, whichever way it changed.
  const changed = subscription();
  await changed.s.check();
  assert.equal(changed.now().state, 'signed_in');
  changed.fakes.last().account = null;
  const again = changed.s.check();
  const first = changed.fakes.last().calls.at(-1)!;
  changed.fakes.last().event('connection/changed', {});
  changed.fakes.last().event('connection/changed', {});
  await new Promise((r) => setTimeout(r, 20));
  changed.fakes.last().account = SIGNED_OUT;
  changed.fakes.last().reply(first.id, ACCOUNT);
  await again;
  assert.deepEqual([changed.now().state, changed.fakes.last().count('connection/read')], ['signed_out', 3], 'two changes during one read are one more read');
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
  assert.deepEqual(await begin(noisy.s), local('the sign-in state of the ChatGPT subscription is not known (check it in the control window)'));
  noisy.fakes.last().onCall = () => undefined;
  await noisy.s.check();
  assert.deepEqual([noisy.now().state, noisy.now().detail, noisy.fakes.last().count('connection/read'), noisy.fakes.last().count('companion/start'), noisy.fakes.last().turns().length], ['signed_in', null, 5, 0, 0]);
  assert.deepEqual([changed.now().state, changed.now().detail], ['signed_out', null], 'a change that was read leaves nothing to say');
  // Before the user's first Check a change reads nothing (nothing is started for it).
  const idle = subscription();
  await idle.s.login();
  idle.fakes.last().event('connection/changed', {});
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(idle.fakes.last().count('connection/read'), 0);
});

test('an account read belongs to the connector it went to: once that one is fenced, lost or ended, nothing it said is published, nothing is read again, and no other connector is started', async () => {
  const line = (v: unknown): string => `${JSON.stringify(v)}\n`;
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
  assert.deepEqual([a.now().plan, a.now().quota, a.now().models, a.now().model], [null, null, [], null], 'nothing of the answer is published');
  assert.deepEqual(a.said.filter((x) => x.mode === 'managed' && (x.state === 'signed_in' || x.state === 'signed_out' || x.state === 'unknown')), [], 'at no moment');
  assert.deepEqual([await begin(a.s), await a.s.turn(turn())], [local(UNAVAILABLE), NOT_RUNNING]);
  assert.equal(a.fakes.made.length, 1, 'a Start of the AI, or a turn, starts none either');
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
  ok.fakes.last().stdout.write(CHANGED + line({ id: ok.fakes.last().calls[0]!.id, result: SIGNED_OUT }));
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
  c.stdout.write(`${JSON.stringify({ id, result: { login_id: 'login-1', auth_url: LOGIN_URL } })}\n${OVER}`);
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
  // A read does not wipe it, and a Start of the AI is refused in words that fit.
  await nob.s.check();
  assert.deepEqual([nob.now().login, nob.now().detail], ['waiting', NO_BROWSER]);
  assert.deepEqual(await begin(nob.s), local('a sign-in is still pending, though its page could not be opened: cancel it in the control window'));
  assert.equal(nob.fakes.last().count('companion/start'), 0);
  await nob.s.cancelLogin();
  assert.deepEqual([nob.now().login, nob.now().detail], ['cancelled', null]);
});

test('a turn refused as not signed in by a connector that is fenced in the same chunk is not said as signed out: the connector is not available', async () => {
  const w = await started();
  const { fakes, now, said, c } = w;
  const o = await out(w);
  const from = said.length;
  c.stdout.write(`${JSON.stringify({ id: o.id, error: { code: 'unauthenticated', submission: 'not_submitted', message: 'raw' } })}\n${OVER}`);
  assert.deepEqual(await o.done, { status: 'refused', code: 'unauthenticated', reason: 'ChatGPT is not signed in', submission: 'not_submitted' });
  assert.deepEqual([now().state, fakes.made.length, w.s.sessionLive(SESSION)], ['unavailable', 1, false]);
  assert.equal(said.slice(from).some((x) => x.mode === 'managed' && x.state === 'signed_out'), false);
  // Positive control: the same refusal from a connector that goes on running is said as signed out.
  const live = await started();
  const asked = await out(live);
  live.c.fail(asked.id, 'unauthenticated');
  await asked.done;
  assert.equal(live.now().state, 'signed_out');
});

test('a failed account read and a failed sign-in start are said in their own words, never as a turn that was not answered', async () => {
  const READ: Record<string, string> = {
    failed: 'the account could not be read',
    quota: 'the account could not be read',
    allowance_exhausted: 'the account could not be read',
    rate_limited: 'the account could not be read',
    session_stopped: 'the account could not be read',
    invalid_request: 'the account could not be read',
    busy: 'the connector is busy, so the account was not read; check again',
    unauthenticated: 'the account could not be read: the connector says ChatGPT is not signed in',
    unavailable: UNAVAILABLE,
    'a code this app does not know': 'the account could not be read',
  };
  for (const [code, said] of Object.entries(READ)) {
    const { s, fakes, now } = subscription(WSL, {}, (c) => void ((c.account = null), (c.onCall = (call) => (call.method === 'connection/read' ? c.fail(call.id, code) : undefined))));
    await s.check();
    assert.deepEqual([now().state, now().detail, fakes.made.length], ['unavailable', said, 1], code);
  }
  const START_SAID: Record<string, string> = {
    failed: 'the sign-in could not be started',
    quota: 'the sign-in could not be started',
    allowance_exhausted: 'the sign-in could not be started',
    unauthenticated: 'the sign-in could not be started',
    busy: 'a sign-in is already pending in the connector, or the AI session is running, so no sign-in was started',
    unavailable: UNAVAILABLE,
  };
  for (const [code, said] of Object.entries(START_SAID)) {
    const { s, opened, now } = subscription(WSL, {}, (c) => void (c.manual.add('connection/login/start'), (c.onCall = (call) => (call.method === 'connection/login/start' ? c.fail(call.id, code) : undefined))));
    await s.check();
    await s.login();
    assert.deepEqual([now().login, now().detail, opened], ['failed', said, []], code);
  }
  // None of them speaks of a request, a question or an answer, and none is a turn's own text for that code (but for
  // "not available", which is the connection's); only the sign-in's `busy` names the AI session, as what is running.
  for (const [code, said] of [...Object.entries(READ), ...Object.entries(START_SAID)]) {
    assert.equal(/answer|request|question|did not complete|was not taken/.test(said), false, said);
    if (code !== 'unavailable') assert.notEqual(said, LIVE_ERROR_TEXT[code], code);
  }
});

test('a connector that ends while a sign-in is being started is said as ended, not as "did not answer"; only its output closing, while it runs, ends it here and leaves what was out not known (QA-SUB-12, QA-SUB-13)', async () => {
  const w = subscription(WSL, {}, (k) => void k.manual.add('connection/login/start'));
  await w.s.check();
  const signing = w.s.login();
  await until('its start is out', () => w.fakes.last().count('connection/login/start') === 1);
  w.fakes.last().exit(1);
  await signing;
  assert.deepEqual([w.now().login, w.now().detail, w.now().state, w.opened], ['failed', 'the connector ended before the sign-in completed', 'unavailable', []]);
  // No answer within the bound, from a connector that is still running, is "did not answer".
  const slow = subscription(WSL, { request_ms: 60 }, (k) => void k.manual.add('connection/login/start'));
  await slow.s.check();
  await slow.s.login();
  assert.deepEqual([slow.now().login, slow.now().detail, slow.fakes.last().exited], ['failed', 'the connector did not answer', false]);
  // Only the output closes; the process goes on. Its exit is given a moment, then it is ended here: a turn that is
  // out ends as not known (never sent again), the account is not available, and only the user's Check starts one again.
  const mute = subscription(WSL, { ask_ms: 5000 }); // (the turn's own bound is far: what ends it here is the closed output)
  await mute.s.check();
  assert.equal((await begin(mute.s)).ok, true);
  const out = mute.s.turn(turn());
  await until('sent', () => mute.fakes.last().turns().length === 1);
  const first = mute.fakes.last();
  first.stdout.end();
  assert.equal(first.exited, false);
  assert.deepEqual(await out, { status: 'uncertain', reason: 'no answer came; whether ChatGPT worked on it is not known', submission: 'unknown' });
  assert.deepEqual([mute.now().state, mute.s.sessionLive(SESSION), mute.s.running()], ['unavailable', false, false]);
  await until('ended by the end of its input', () => first.exited);
  assert.equal(mute.fakes.made.length, 1, 'nothing is started in its place');
  await mute.s.check();
  assert.deepEqual([mute.fakes.made.length, mute.now().state, mute.fakes.last().turns().length], [2, 'signed_in', 0], 'the user\'s Check starts one again; the turn is not sent again');
  // A connector that simply ends closes its output too: said as its own end, and it is not ended a second time.
  const plain = subscription();
  await plain.s.check();
  plain.fakes.last().stdout.end();
  plain.fakes.last().exit(0);
  await new Promise((r) => setTimeout(r, 700));
  assert.deepEqual([plain.now().state, plain.s.ending(), plain.now().detail], ['unavailable', false, null]);
});

test('a pending sign-in is not forgotten when the account reads as signed in: it stays pending with its Cancel, no AI session is started meanwhile, and its completion is still taken', async () => {
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
  // The connector would refuse a session while it holds that sign-in: said here, and nothing is sent.
  assert.deepEqual(await begin(s), local('a sign-in is still pending: finish it in your browser, or cancel it in the control window'));
  assert.deepEqual([c().count('companion/start'), s.sessionLive(SESSION)], [0, false]);
  // Its completion is still this app's: taken, read again, and then the AI can be started and a turn sent.
  c().event('connection/login/completed', { login_id: 'login-1', success: true, error: null });
  await until('completed and read again', () => now().login === 'none' && now().state === 'signed_in' && now().detail === null);
  assert.equal((await begin(s)).ok, true);
  const asked = await out({ s, fakes });
  c().answer('An answer.');
  assert.equal((await asked.done).status, 'answered');
  assert.equal(opened.length, 2, 'one page for each of the user\'s two presses');
  // The same while a sign-in is still starting.
  const starting = subscription(WSL, {}, (k) => void k.manual.add('connection/login/start'));
  await starting.s.check();
  void starting.s.login();
  await until('starting', () => starting.now().login === 'starting');
  // A read that says signed in does not forget it either; nothing is said of a browser or a Cancel yet.
  await starting.s.check();
  assert.deepEqual([starting.now().state, starting.now().login, starting.now().detail], ['signed_in', 'starting', null]);
  assert.deepEqual(await begin(starting.s), local('a sign-in is being started: the AI cannot be started until that sign-in is over'));
  assert.equal(starting.fakes.last().count('companion/start'), 0);
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
  // Refused (whatever the code: in this version "no such sign-in" is not told apart from "not available"), another
  // shape, or no answer at all: not said as cancelled; it can be cancelled again.
  for (const answer of [(w: Awaited<ReturnType<typeof waiting>>) => w.c().fail(w.cancelId(), 'failed'), (w: Awaited<ReturnType<typeof waiting>>) => w.c().fail(w.cancelId(), 'invalid_request'), (w: Awaited<ReturnType<typeof waiting>>) => w.c().fail(w.cancelId(), 'unavailable'), (w: Awaited<ReturnType<typeof waiting>>) => w.c().reply(w.cancelId(), { cancelled: true }), (w: Awaited<ReturnType<typeof waiting>>) => w.c().reply(w.cancelId(), null), () => undefined]) {
    const w = await waiting();
    const cancel = w.s.cancelLogin();
    await until('told', () => w.c().count('connection/login/cancel') === 1);
    answer(w);
    await cancel; // (unanswered: the request's own bound)
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
  const losing = lost.s.cancelLogin();
  await until('told', () => lost.c().count('connection/login/cancel') === 1);
  lost.c().exit(1);
  await losing;
  assert.deepEqual([lost.now().login, lost.now().detail, lost.now().state], ['failed', 'the connector ended before the sign-in completed', 'unavailable']);
  // After a cancel that was not confirmed this app does not know whether the connector still holds that sign-in: a
  // Start of the AI is then left to the connector, which does know. While it holds it, it refuses (and that is said);
  // once it does not, the session starts. The sign-in itself is still said as pending here until its Cancel is confirmed.
  const over = await waiting();
  const press2 = over.s.cancelLogin();
  await until('told', () => over.c().count('connection/login/cancel') === 1);
  over.c().fail(over.cancelId(), 'invalid_request');
  await press2;
  assert.deepEqual([over.now().login, over.now().detail, over.s.notStartable()], ['waiting', NOT_CONFIRMED, null]);
  over.c().manual.add('companion/start');
  const refused = begin(over.s);
  await until('the connector is asked', () => over.c().count('companion/start') === 1);
  over.c().fail(over.c().calls.at(-1)!.id, 'busy');
  assert.deepEqual(await refused, { ok: false, code: 'busy', reason: 'the connector is busy (a sign-in is pending in it, or an earlier request is still being ended), so the AI was not started; try again in a moment' });
  assert.deepEqual([over.s.sessionLive(SESSION), over.now().login, over.now().detail], [false, 'waiting', NOT_CONFIRMED]);
  over.c().manual.delete('companion/start');
  assert.deepEqual([(await begin(over.s)).ok, over.c().count('companion/start'), over.s.sessionLive(SESSION), over.now().login], [true, 2, true, 'waiting']);
  // An address that is not opened: its cancel's answer is read too.
  const NOT_OPENED = 'the sign-in address the connector gave is not an official ChatGPT address, so it was not opened';
  for (const answer of ['acknowledged', 'not held', 'refused', 'another shape'] as const) {
    const w = world();
    await w.s.check();
    w.c().loginUrl = 'https://auth.openai.com.evil.example/authorize';
    const starting = w.s.login();
    await until('its cancel is told', () => w.c().count('connection/login/cancel') === 1);
    assert.deepEqual([w.now().login, w.now().detail], ['refused_address', NOT_OPENED], 'refused from the moment the address is, whatever its cancel comes to');
    if (answer === 'acknowledged') w.c().reply(w.cancelId(), {});
    else if (answer === 'not held') w.c().fail(w.cancelId(), 'invalid_request');
    else if (answer === 'refused') w.c().fail(w.cancelId(), 'failed');
    else w.c().reply(w.cancelId(), { cancelled: true });
    await starting;
    if (answer === 'acknowledged') {
      // That sign-in is over in the connector: said as not started, and the connector goes on.
      assert.deepEqual([w.opened, w.now().login, w.now().detail, w.now().state, w.c().exited], [[], 'refused_address', NOT_OPENED, 'signed_in', false], answer);
      continue;
    }
    // The connector did not let go of a sign-in this app refused (any error, "no such sign-in" included: it is not
    // told apart in this version): it is ended, so nothing stays pending in it.
    await until('ended', () => w.c().exited);
    assert.deepEqual([w.opened, w.now().login, w.now().state, w.fakes.made.length], [[], 'refused_address', 'unavailable', 1], answer);
    assert.equal(w.now().detail, `${NOT_OPENED}; the connector did not confirm that it let that sign-in go, so that connector is no longer used and is being ended (check the connection to start one again)`);
    // Never said as a sign-in that failed because "the connector was ended here": this app ended it, for the refusal (QA-SUB-14).
    assert.deepEqual(w.said.filter((x) => x.mode === 'managed' && x.login === 'failed'), [], answer);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(w.fakes.made.length, 1, 'none is started by the app itself');
    await w.s.check(); // only the user's own Check starts one again
    assert.deepEqual([w.fakes.made.length, w.now().state, w.now().login], [2, 'signed_in', 'none']);
  }
  // The connector is lost while that cancel is out: both are said, the refusal of the address and that the connector
  // ended before it confirmed the cancel (QA-SUB-15); nothing is opened and nothing stays pending.
  const gone = world();
  await gone.s.check();
  gone.c().loginUrl = 'https://auth.openai.com.evil.example/authorize';
  const refusedAddress = gone.s.login();
  await until('its cancel is told', () => gone.c().count('connection/login/cancel') === 1);
  gone.c().exit(1);
  await refusedAddress;
  assert.deepEqual([gone.opened, gone.now().login, gone.now().state, gone.now().detail, gone.fakes.made.length], [[], 'refused_address', 'unavailable', `${NOT_OPENED}; the connector ended before it confirmed that it let that sign-in go`, 1]);
  assert.deepEqual(gone.said.filter((x) => x.mode === 'managed' && x.login === 'failed'), []);
});

test('"the account changed" is read a bounded number of times between the user\'s own Checks, also when it is said after each read; sparse changes are each read', async () => {
  const CHECK_AGAIN = 'the account may have changed since it was last read, and it is not read again by itself; check again';
  const NOT_KNOWN = local('the sign-in state of the ChatGPT subscription is not known (check it in the control window)');
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
  assert.deepEqual(await begin(s), NOT_KNOWN);
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
  // A turn refused as not signed in while a read is out does not end that read's turn: it is read once more.
  const mid = await started();
  const asked = await out(mid);
  mid.c.account = null;
  mid.c.event('connection/changed', {});
  await until('a read is out', () => mid.c.count('connection/read') === 2 && mid.now().state === 'checking');
  mid.c.fail(asked.id, 'unauthenticated');
  assert.equal((await asked.done).status, 'refused');
  assert.equal(mid.now().state, 'checking', 'the read that is out says how it is, not the turn');
  mid.c.account = SIGNED_OUT;
  mid.c.reply(mid.c.calls.filter((x) => x.method === 'connection/read')[1]!.id, ACCOUNT); // the older answer
  await until('read once more', () => mid.c.count('connection/read') === 3 && mid.now().state === 'signed_out');
  assert.equal(mid.now().detail, null);
  // The same refusal after a read failed: said as not signed in, without the failed read's reason beside it.
  const failed = await started();
  const pending = await out(failed);
  failed.c.account = null;
  failed.c.event('connection/changed', {});
  await until('a read is out', () => failed.c.count('connection/read') === 2);
  failed.c.fail(failed.c.calls.filter((x) => x.method === 'connection/read')[1]!.id, 'busy');
  await until('the read failed', () => failed.now().state === 'unavailable');
  assert.equal(failed.now().detail, 'the connector is busy, so the account was not read; check again');
  failed.c.fail(pending.id, 'unauthenticated');
  await pending.done;
  assert.deepEqual([failed.now().state, failed.now().detail], ['signed_out', null]);
  // The same refusal once changes are no longer read: the state stays "not known" with its notice (the turn's own
  // card says it was refused); only the user's Check says how the account is.
  const latched = await started();
  const held = await out(latched);
  for (let i = 0; i < 4; i += 1) {
    latched.c.event('connection/changed', {});
    await until('read, or not', () => latched.now().state !== 'checking' && latched.c.count('connection/read') === Math.min(2 + i, 4));
  }
  assert.deepEqual([latched.now().state, latched.now().detail], ['unknown', CHECK_AGAIN]);
  latched.c.fail(held.id, 'unauthenticated');
  assert.deepEqual(await held.done, { status: 'refused', code: 'unauthenticated', reason: 'ChatGPT is not signed in', submission: 'not_submitted' });
  assert.deepEqual([latched.now().state, latched.now().detail], ['unknown', CHECK_AGAIN], 'not said as signed out from the turn alone');
  await latched.s.check();
  assert.deepEqual([latched.now().state, latched.now().detail], ['signed_in', null]);
});

test('an interrupt or a Stop is a confirmed interruption only by its own exact receipt and the turn itself ending as interrupted; anything else, cancelled:false included, stays not confirmed', async () => {
  const outcomeOf = async (set: (c: FakeConnector) => void, by: 'interrupt' | 'stop', end: (c: FakeConnector, id: string) => void = () => undefined): Promise<TurnOutcome> => {
    const w = await started();
    set(w.c);
    const sent = turn();
    const o = await out(w, sent);
    if (by === 'interrupt') w.s.interrupt(sent.request_id);
    else w.s.stopSession(SESSION);
    end(w.c, o.id);
    return o.done; // the turn itself ends as `cancelled` (or `session_stopped`), as the released connector ends it
  };
  // In this version a Stop's receipt has the interrupt's shape: {} (the earlier envelope's acknowledgement of a Stop) confirms nothing.
  const NOT = [{}, null, [], 'cancelled', true, { uncertain: 'unknown' }, { cancelled: true, uncertain: 'unknown' }, { cancelled: true }, { uncertain: false }, { cancelled: 'true', uncertain: false }, { cancelled: 1, uncertain: 0 }, { cancelled: true, uncertain: null }, { cancelled: true, uncertain: false, more: 1 }, { cancelled: false, uncertain: false }, { cancelled: true, uncertain: true }, { stopped: true }, { ok: true }];
  for (const by of ['interrupt', 'stop'] as const) {
    const receipt = by === 'interrupt' ? 'cancelReceipt' : 'stopReceipt';
    for (const result of NOT) assert.deepEqual(interrupted(await outcomeOf((c) => void (c[receipt] = { result }), by)), { status: 'cancelled', uncertain: true, submission: 'submitted' }, `companion/${by} answered ${JSON.stringify(result)}`);
    assert.deepEqual(interrupted(await outcomeOf((c) => void (c[receipt] = { result: { cancelled: true, uncertain: false } }), by)), { status: 'cancelled', uncertain: false, submission: 'submitted' }, by);
    // Refused by the connector, or not answered at all (the request's own bound), while the turn does end as interrupted.
    assert.deepEqual(interrupted(await outcomeOf((c) => void (c.manual.add(`companion/${by}`), (c.onCall = (call) => (call.method === `companion/${by}` ? c.fail(call.id, 'failed') : undefined))), by, (c, id) => c.fail(id, by === 'interrupt' ? 'cancelled' : 'session_stopped', 'submitted'))), { status: 'cancelled', uncertain: true, submission: 'submitted' }, `companion/${by} refused`);
    assert.deepEqual(interrupted(await outcomeOf((c) => void c.manual.add(`companion/${by}`), by, (c, id) => c.fail(id, by === 'interrupt' ? 'cancelled' : 'session_stopped', 'submitted'))), { status: 'cancelled', uncertain: true, submission: 'submitted' }, `companion/${by} not answered`);
    // The exact receipt, and the turn ending in another way: its answer arrives, it fails otherwise, or it never ends.
    // Nothing of it is returned, and it is not said as stopped for certain.
    const silent = (c: FakeConnector): void => void (c.onCancel = 'silent'); // the receipt is exact; the turn is ended by the test
    assert.deepEqual(interrupted(await outcomeOf(silent, by, (c) => c.answer('An answer that raced it.'))), { status: 'cancelled', uncertain: true, submission: 'submitted' }, `${by}: answered after all`);
    assert.deepEqual(interrupted(await outcomeOf(silent, by, (c, id) => c.fail(id, 'failed', 'unknown'))), { status: 'cancelled', uncertain: true, submission: 'unknown' }, `${by}: failed otherwise`);
    assert.deepEqual(interrupted(await outcomeOf(silent, by)), { status: 'cancelled', uncertain: true, submission: 'unknown' }, `${by}: never ended`);
    // Positive control for those three: the same exact receipt and the turn ending as the connector ends an interrupted one.
    assert.deepEqual(interrupted(await outcomeOf(silent, by, (c, id) => c.fail(id, by === 'interrupt' ? 'cancelled' : 'session_stopped', 'submitted'))), { status: 'cancelled', uncertain: false, submission: 'submitted' }, `${by}: ended as interrupted`);
  }
  // Both were said (the interrupt, then the Stop): confirmed only if each was.
  for (const [stopReceipt, uncertain] of [[{ ok: true }, true], [{ cancelled: true, uncertain: false }, false]] as const) {
    const both = await started();
    both.c.onCancel = 'silent';
    both.c.stopReceipt = { result: stopReceipt };
    const sent = turn();
    const o = await out(both, sent);
    both.s.interrupt(sent.request_id);
    both.s.stopSession(SESSION);
    await until('both told', () => both.c.count('companion/interrupt') === 1 && both.c.count('companion/stop') === 1);
    both.c.fail(o.id, 'cancelled', 'submitted');
    assert.deepEqual(interrupted(await o.done), { status: 'cancelled', uncertain, submission: 'submitted' }, JSON.stringify(stopReceipt));
  }
});

const SHIM_ENDED = 'a connector that was ended here did not end by itself in time; its wsl.exe shim was ended, which does not show that the connector, or the Codex app server it runs, ended in WSL';
const SHIM_NOT_ENDED = 'a connector that was ended here did not end by itself in time; its wsl.exe shim did not end either, so it is not known that the connector, or the Codex app server it runs, ended in WSL';

test('whether an interrupted turn leaves the session unsettled: only when its interruption was not confirmed by the connector, or its fate is not known; a turn that was answered anyway, or interrupted for certain, does not', async () => {
  /** A turn out in a started session; `configure` sets the stand-in up, `then` ends the turn (after the interrupt or the Stop was told). */
  const outcomeOf = async (configure: (c: FakeConnector) => void, by: 'interrupt' | 'stop' | 'none', then?: (c: FakeConnector, id: string) => void): Promise<TurnOutcome> => {
    const w = subscription(WSL, { request_ms: 150, ask_ms: 2000 }, configure);
    await w.s.check();
    assert.equal((await begin(w.s)).ok, true);
    const t = turn();
    const done = w.s.turn(t);
    await until('sent', () => w.fakes.last().turns().length === 1);
    if (by === 'interrupt') w.s.interrupt(t.request_id);
    if (by === 'stop') w.s.stopSession(SESSION);
    if (by !== 'none') await until('told', () => w.fakes.last().count(`companion/${by}`) === 1);
    then?.(w.fakes.last(), w.fakes.last().turns()[0]!.id);
    return done;
  };
  const unsettled = async (...a: Parameters<typeof outcomeOf>): Promise<boolean | undefined> => ((await outcomeOf(...a)) as { unsettled?: boolean }).unsettled;
  for (const by of ['interrupt', 'stop'] as const) {
    const receipt = by === 'interrupt' ? 'cancelReceipt' : 'stopReceipt';
    // Interrupted for certain: settled.
    assert.equal(await unsettled(() => undefined, by), false, `${by}: confirmed`);
    // The connector says the interruption was not confirmed (it stops its session then): unsettled.
    assert.equal(await unsettled((c) => void (c.onCancel = 'unconfirmed'), by), true, `${by}: the connector's own "uncertain"`);
    // No acknowledgement at all, an error, or another shape: not confirmed, so unsettled.
    assert.equal(await unsettled((c) => void c.manual.add(`companion/${by}`), by, (c, id) => c.fail(id, by === 'interrupt' ? 'cancelled' : 'session_stopped', 'submitted')), true, `${by}: not answered`);
    assert.equal(await unsettled((c) => void (c[receipt] = { result: {} }), by), true, `${by}: another shape`);
    // The turn was answered just before its interruption (nothing was left to interrupt): the session is as it was.
    assert.equal(await unsettled((c) => void ((c.onCancel = 'silent'), (c[receipt] = { result: { cancelled: false, uncertain: false } })), by, (c) => c.answer('An answer that raced it.')), false, `${by}: answered after all`);
    // The turn itself ends as an unconfirmed interruption, or never ends: unsettled.
    assert.equal(await unsettled((c) => void (c.onCancel = 'silent'), by, (c, id) => c.fail(id, 'interrupt_unconfirmed', 'submitted')), true, `${by}: the turn ended as unconfirmed`);
    assert.equal(await unsettled((c) => void (c.onCancel = 'silent'), by), true, `${by}: the turn never ended`);
  }
  // Ended by the connector itself, with no interrupt and no Stop of this app: unsettled only as an unconfirmed
  // interruption, or when whether it reached ChatGPT is not known.
  assert.equal(await unsettled(() => undefined, 'none', (c, id) => c.fail(id, 'cancelled', 'submitted')), false);
  assert.equal(await unsettled(() => undefined, 'none', (c, id) => c.fail(id, 'cancelled', 'not_submitted')), false);
  assert.equal(await unsettled(() => undefined, 'none', (c, id) => c.fail(id, 'cancelled', 'unknown')), true);
  // The connector's own "an interruption was not confirmed" for a turn this app did not interrupt is its refusal
  // (it has stopped its session): said as that, never as a request that was cancelled here.
  assert.deepEqual(await outcomeOf(() => undefined, 'none', (c, id) => c.fail(id, 'interrupt_unconfirmed', 'not_submitted')), { status: 'refused', code: 'interrupt_unconfirmed', reason: 'an interruption was not confirmed by ChatGPT, so the AI session was stopped', submission: 'not_submitted' });
});

test('a turn the connector ends as cancelled, when this app asked for no interrupt and no Stop, is not said as a confirmed stop; nothing is sent again and no connector is started', async () => {
  const w = await started();
  const { fakes, now, c } = w;
  const o = await out(w);
  c.fail(o.id, 'cancelled', 'submitted'); // as the released connector does at its request-history limit
  assert.deepEqual(interrupted(await o.done), { status: 'cancelled', uncertain: true, submission: 'submitted' });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([c.count('companion/interrupt'), c.count('companion/stop'), c.turns().length, fakes.made.length, now().state, now().asking, w.s.sessionLive(SESSION)], [0, 0, 1, 1, 'signed_in', false, true], 'no interrupt or Stop of this app, one send, one connector');
  // The same reply after this app's own confirmed interrupt, or its confirmed Stop, is the confirmed stop it was.
  for (const by of ['interrupt', 'stop'] as const) {
    const own = await started();
    const sent = turn();
    const asked = await out(own, sent);
    if (by === 'interrupt') own.s.interrupt(sent.request_id);
    else own.s.stopSession(SESSION);
    assert.deepEqual(interrupted(await asked.done), { status: 'cancelled', uncertain: false, submission: 'submitted' }, by);
  }
  // interrupt_unconfirmed stays what it says: the connector's own refusal (it stopped its session), not a cancel of this app's.
  const un = await started();
  const held = await out(un);
  un.c.fail(held.id, 'interrupt_unconfirmed', 'submitted');
  assert.deepEqual(await held.done, { status: 'refused', code: 'interrupt_unconfirmed', reason: 'an interruption was not confirmed by ChatGPT, so the AI session was stopped', submission: 'submitted' });
});

test('a connector that does not end by itself within its time: its shim is ended, that its own end was not seen is said and kept, and nothing is started in its place', async () => {
  // Fenced for a line that is not the envelope's, while it ignores the end of its input.
  const { s, fakes, now, said } = subscription(WSL, { end_ms: 80 }, (c) => void (c.endDelayMs = 60_000));
  await s.check();
  assert.equal((await begin(s)).ok, true);
  const c = fakes.last();
  let kills = 0;
  const kill = c.kill.bind(c);
  c.kill = () => (kills++, kill());
  c.stdout.write(OVER);
  await until('fenced', () => now().state === 'unavailable');
  assert.deepEqual([now().detail, kills, c.exited, s.sessionLive(SESSION)], [null, 0, false, false], 'still within its time: nothing is said yet, and it is not killed; its AI session is over from the fence on');
  await until('its shim was ended', () => c.exited);
  await until('said', () => now().detail === SHIM_ENDED);
  assert.deepEqual([now().state, kills, fakes.made.length], ['unavailable', 1, 1]);
  assert.equal((said.at(-1) as { detail?: string | null }).detail, SHIM_ENDED, 'the windows are told');
  // Nothing is started or sent by the app itself, and a Start of the AI, or a turn, is refused without starting one.
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual([await begin(s, { session_id: OTHER_SESSION }), await s.turn(turn())], [local(UNAVAILABLE), NOT_RUNNING]);
  assert.deepEqual([fakes.made.length, c.turns().length, c.count('companion/stop')], [1, 0, 0]);
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
  k.stdout.write(OVER);
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
  signing.fakes.last().stdout.write(OVER);
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
  late.fakes.last().stdout.write(OVER);
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
  c.stdout.write(OVER); // over the bound, with no line end
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
  k.stdout.write(OVER);
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
  first.stdout.write(OVER);
  await until('the first is fenced', () => two.now().state === 'unavailable');
  await two.s.check(); // the user's own Check starts another
  const second = two.fakes.last();
  assert.notEqual(second, first);
  second.stdout.write(OVER);
  await until('the second ended', () => second.exited);
  assert.equal(first.exited, false);
  await two.s.quit();
  assert.deepEqual([first.exited, second.exited], [true, true]);
});

test('a real child process over real pipes: lines both ways, a session and its turns, and the end of its input ends it', async () => {
  const script = path.join(import.meta.dirname, 'fake-connector.mjs');
  let child: ReturnType<typeof spawn> | null = null;
  const { s, now } = subscription(WSL, { spawn: (() => (child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }))) as never, request_ms: 10_000, ask_ms: 10_000, end_ms: 5_000 });
  await s.check(); // (the stand-in child refuses a line of another version than lc-subscription-live/1, so this read is one of it)
  assert.deepEqual([now().state, now().model, now().quota], ['signed_in', 'vision-model', { available: false, ordinary_usage_allowed: null, windows: [] }]);
  assert.deepEqual(await begin(s), { ok: true, start: START, remaining_submissions: 12, expires_in_ms: 300_000 });
  const outcome: TurnOutcome = await s.turn(turn());
  assert.deepEqual(outcome, { status: 'answered', answer: { request_id: turn().request_id, text: 'SYNTHETIC answer from the test connector: 2560x1600 px, 8 bytes, focus, hint', model: 'vision-model', latency_ms: 1, thread_id: 'thread-synthetic', turn_id: 'turn-synthetic', kind: 'generated_assistance' }, submission: 'submitted' });
  // A picture of some megabytes: one line of many chunks into the pipe, read whole at the other end; and a look's answer is an observation.
  const bytes = 3 * 1024 * 1024;
  const big = await s.turn(look({ image: { ...turn().image, png_base64: Buffer.alloc(bytes, 7).toString('base64') }, history: [{ kind: 'assistant', text: 'A hint · 提示 😀', at: '2026-10-01T05:00:05.000Z', frame_seq: 6, request_id: turn().request_id, audio_source: null, presentation: 'shown' }] }));
  assert.deepEqual([big.status, big.status === 'answered' && big.answer.text, big.status === 'answered' && big.answer.kind], ['answered', `SYNTHETIC answer from the test connector: 2560x1600 px, ${bytes} bytes, observation, none`, 'observation']);
  // The Stop reaches it: a turn written to it afterwards would be refused there; here it is not even written.
  s.stopSession(SESSION);
  assert.deepEqual([s.sessionLive(SESSION), await s.turn(turn({ request_id: `${SESSION}.9.after` }))], [false, NOT_RUNNING]);
  const exited = new Promise<number | null>((r) => child!.once('exit', (code) => r(code)));
  await s.quit();
  assert.equal(await exited, 0, 'ended by the end of its input, not killed');
});
