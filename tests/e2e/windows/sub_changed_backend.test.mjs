// node --test tests/e2e/windows/sub_changed_backend.test.mjs   (no Windows, no wsl.exe, no window, no codex, no account, no network, no database; about 40 s)
// The Backend corrections QA-SUB-02 (a connector that stays alive but dead after a fatal failure) and QA-SUB-03 (a turn
// with more than 4096 notifications is killed, deltas included), and the Windows lifecycle follow-up (W-KNOWN-CANCEL,
// W-KNOWN-END-BUDGET), retested ACROSS the two released components: the Windows client over real pipes to the connector.
//
// THREE COMMITS (sub_tree.mjs):
//   RELEASED       c44e620  the source under test.
//   FIRST_RELEASE  8eac9fc  the first combined correction. RELEASED is it plus the Windows lifecycle follow-up, which
//                           changed one file: apps/windows/src/main/subscription.ts. The connector side (`services`,
//                           `packages`, pyproject.toml) is the same tree on both: the first test compares the tree ids.
//   BEFORE         3e4b406  the candidate QA-SUB-01 to 08 were found on: the negative control of every correction.
// The Backend corrections (QA-SUB-02, QA-SUB-03) are shown on RELEASED with BEFORE as the control and no third column:
// the connector is the same tree on FIRST_RELEASE. Those tests do pass through changed lines of the client (every
// status() and every quit() does), in the case where the change changes nothing: the connector ends in time, no
// sign-in is pending, and the connector never answers `cancelled` by itself. That FIRST_RELEASE's client gives the
// same values there is read from the source, not run. Where RELEASED differs from FIRST_RELEASE (the follow-up),
// all three commits are run and asserted side by side: before / first_release / released.
//
// REAL, taken from `git archive` exports of the commits (sub_tree.mjs), never from this worktree:
// - the Windows client class `Subscription` (apps/windows/src/main/subscription.ts), used as main.ts uses it:
//   check(), ask(), login(), quit(), status() and what it notifies;
// - the connector as a real process over real pipes: `chatgpt_local.main()` with its bridge, `chatgpt_rpc.py`, the
//   Learning owner's prepare and bind, and the receipt writer. Each client runs with the connector of its own commit.
// STAND-INS (each said where it is used):
// - qa_connector_relay.py in place of wsl.exe: what the client would run is recorded and never run. See its header,
//   also for what a real launch does that this one does not (the launch checks, the provider's name, the isolation
//   reads before every question).
// - the inner Codex App Server is the repo's own synthetic child (FAKE and client() of tests/test_chatgpt_rpc.py).
//   Its text is always the RELEASED one, also under the BEFORE connector, because the BEFORE text has no delta and no
//   flood mode; the second test shows that this is the only difference between the two texts.
// - the picture is the repo's own test picture png() (2 x 2); the request around it is written here.
// - codex is a file of this test that would leave a mark if it were ever run; the last test shows it never was.
// - the receipts are written by the released writer, with stand-in facts about a binary, in this test's own folders.
// - a sign-in: one test starts the synthetic child's "sign-in" (an address of that child's text) to have one pending
//   at the quit. `openExternal` is a recorder: nothing is opened, and there is no account and no browser.
// - a connector that does not end in time is the relay holding the end of its input back; a wsl.exe shim that outlives
//   the client's kill is the relay ignoring SIGTERM. No cleanup of the connector takes that time here.
// So a result here says how the released sources behave together on Linux pipes. It says nothing about wsl.exe, the
// app's windows, the real codex or a real answer.
//
// NOT SHOWN by this file:
// - wsl.exe and Windows: whether ending the shim ends anything in WSL, how long an exit takes to arrive through it.
//   The app's windows and the sentences the control window makes of status() (control.ts is not run).
// - The LEVEL of the two QA-SUB-03 bounds: a flood far over the bound still ends the turn; the value is read from the
//   running connector's module. The synthetic child's floods are fixed far over both (10000 lifecycle notifications
//   against 4096; about 164 MB against 32 MiB), so a connector whose lifecycle check sat at 8192, or whose byte check
//   sat at 128 MiB, passes these tests too.
// - Most of the RECEIPT part of the Backend correction (chatgpt_local.py). One path of it is reached (a question
//   cancelled by the connector's own close after a fatal failure: `close(terminal_failure=True)` leaving it unmarked,
//   and `_unfinished_outcome` from the CancelledError branch of `_ask`, receipt 'uncertain'). NOT exercised, and no
//   receipt written through them was observed: the three `client.terminal` guards in `_ask` (after the answer, after
//   the bind, after the finish), the branch `elif self.closed and self.client.terminal.is_set()`, close()'s own finish
//   of a question whose task never ran, and the 'cancelled' and 'not_submitted' results of `_unfinished_outcome`.
//   With the repo's synthetic modes most of these need a failure inside one or two turns of the connector's event
//   loop, or a task that never ran. The 'cancelled' result of `_unfinished_outcome` may be reachable (a review read
//   the source so: the user's own cancel during the connector's 3 s wait in mode start_error, then the inner child's
//   end); that was NOT tried here. Every other fatal receipt in this file
//   (outcome 'failed') comes from the older generic branch, also for a failure before the turn's start was answered.
// - The read loop's own yield during a continuing flood (so that the turn's deadline and a cancel act against input
//   that is already buffered): through a real pipe the reader waits for input between chunks anyway (tried once in
//   scratch: the repo's flood_slow mode under a 1 s deadline gave the same result with that yield removed). And the
//   LENGTH of the grace period after a fatal failure: its value (1 s) is read from the running connector's module;
//   the one test that runs it out would pass with any grace well under 2.7 s.
// - On RELEASED, the words for a sign-in whose connector ended BY ITSELF ("the connector ended before the sign-in
//   completed"): this file runs only the quit, where the app ended it ("was ended here"). A client that always said
//   "was ended here" would pass this file; sub_changed_bridge.test.mjs has that case (the connector ends while a
//   sign-in waits). And the note when MORE THAN ONE connector's end was not seen: every case here has at most one.
// - Durable quit reporting: still open with the owner (Web). The note of a connector whose own end was not seen lives
//   in the client object only; what is left for the next launch after a quit is not in RELEASED and not shown.
// - The second changed wording of the follow-up ("... so that connector is no longer used and is being ended (check
//   the connection to start one again)"): it needs a sign-in address the connector passes on and the client refuses,
//   and the synthetic child has none: its one bad address is refused by the connector itself (tried once in scratch:
//   "the sign-in could not be started"). See sub_changed_bridge.test.mjs, which uses a stand-in connector.
// - That the default bound of a connector's end is exactly 10 000 ms: it is waited for once and seen between 9.9 s
//   and 11 s; the number is read from the source.
// - A connector whose own cleanup is slow, a real launch (chatgpt_launch.py is replaced; so also its state lock, which
//   a connector left behind would still hold), the real codex, a real sign-in, a real answer, quota, a network.
//
// QA_EVIDENCE=<existing folder> writes sub_changed_backend.json there (sub_tree.mjs: nothing of a run with a failed test).
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, afterEach, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BEFORE, FIRST_RELEASE, PYTHON, RELEASED, evidence, exportTree, treeIds } from './sub_tree.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RELAY = join(HERE, 'qa_connector_relay.py');
const COMMITS = { released: RELEASED, first_release: FIRST_RELEASE, before: BEFORE };
const THREE = ['before', 'first_release', 'released'];
const TREE = Object.fromEntries(Object.entries(COMMITS).map(([which, commit]) => [which, exportTree(commit)]));
const CLIENT = 'apps/windows/src/main/subscription.ts';
const Subscription = {};
for (const [which, tree] of Object.entries(TREE)) Subscription[which] = (await import(pathToFileURL(join(tree, CLIENT)).href)).Subscription;
/** A time limit for every test: a regression fails instead of hanging. LONG: the tests that wait for a real bound. */
const LIMIT = { timeout: 30_000 }, LONG = { timeout: 60_000 };

const sha = (data) => createHash('sha256').update(data).digest('hex');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const count = (list) => Object.fromEntries([...new Set(list)].sort().map((m) => [m, list.filter((x) => x === m).length]));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (what, ok, ms = 20_000) => {
  for (const by = Date.now() + ms; !ok(); await pause(5)) if (Date.now() > by) assert.fail(`timed out waiting for: ${what}`);
};
// A connector's end as the client's own child object reports it: waited for, but not without end (a failure, not a hang).
const ended = (l, ms = 20_000) => { let timer; return Promise.race([l.exit, new Promise((_, no) => { timer = setTimeout(() => no(new Error('timed out waiting for a connector to end')), ms); })]).finally(() => clearTimeout(timer)); };

// The question: the repo's own test picture, and the facts of a selection as the app's main process would supply them.
const PNG = Buffer.from(spawnSync(PYTHON, ['-c', 'import base64, sys; from services.api.tests.test_image_resolver import png; sys.stdout.write(base64.b64encode(png()).decode())'],
  { cwd: TREE.released, encoding: 'utf8', env: { PATH: '/nonexistent', PYTHONDONTWRITEBYTECODE: '1' } }).stdout, 'base64');
assert.equal(PNG.subarray(1, 4).toString('latin1'), 'PNG', 'the test picture could not be read from the export');
const ask = (id) => ({ request_id: id, question: 'Give one hint about this selected diagram.', assistance: 'hint',
  image: { png_base64: PNG.toString('base64'), sha256: sha(PNG), width: 2, height: 2 },
  context: { capture_session_id: 'qa-session-1', frame_seq: 1, frame_captured_at: '2026-10-01T12:00:00Z', frame_width: 200, frame_height: 100,
    display: { id: 'qa-display', bounds: { x: 0, y: 0, width: 200, height: 100 }, scale_factor: 1 }, region_dip: { x: 10, y: 12, width: 2, height: 2 }, region_px: { x: 10, y: 12, width: 2, height: 2 },
    ink_revision: 3, ink_sha256: sha('synthetic editable ink'), source_url: null, source_version: null, media_position: null } });
// What the client showed for a question; a long answer is said by its length and digest.
const brief = (text) => (text.length > 200 ? `${text.length} characters, sha256 ${sha(text)}` : text);
const shown = (o) => (o.status === 'answered' ? { status: 'answered', request_id: o.answer.request_id, model: o.answer.model, text: brief(o.answer.text) } : o);

const WOULD_RUN = ['wsl.exe', '--distribution', 'qa-not-run', '--user', 'qa-not-run', '--cd', '/qa-not-run', '--exec', '/qa-not-run/python', '-m', 'services.worker.connectors.chatgpt_local'];
const worlds = [];
// What each test saw, for the evidence file (QA_EVIDENCE): recorded before it is asserted.
const observed = {};
const ev = evidence('sub_changed_backend', ['sub_changed_backend.test.mjs', 'sub_tree.mjs', 'qa_connector_relay.py'], COMMITS);
afterEach((t) => ev.seen(t));
after(() => {
  for (const w of worlds) { for (const l of w.launches) if (l.child.exitCode === null && l.child.signalCode === null) l.child.kill('SIGKILL'); rmSync(w.dir, { recursive: true, force: true }); }
  ev.write(observed);
}, { timeout: 30_000 });

// One client of one commit, in a folder of its own. Each time the client starts a connector, the relay is started in
// its place with the next inner mode of `modes` (the last one again after that), the relay options of `relay` for that
// launch (none after the list's end) and a launch folder of its own.
function world(which, modes, { options = {}, timeouts = {}, relay = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qa-sub-backend-'));
  const state = join(dir, 'state'), codex = join(dir, 'stand-in-codex');
  mkdirSync(state, { mode: 0o700 });
  writeFileSync(codex, `#!/bin/sh\necho ran > '${join(dir, 'stand-in-codex-was-run')}'\n`, { mode: 0o755 });
  const launches = [], said = [];
  const s = new Subscription[which]({
    config: { launch: { kind: 'wsl', distribution: 'qa-not-run', user: 'qa-not-run', cd: '/qa-not-run', python: '/qa-not-run/python' }, state_dir: state, codex_bin: codex },
    notify: (x) => said.push(x), openExternal: () => assert.fail('nothing is opened by this check'),
    spawn: (command, args, o) => {
      const mode = modes[Math.min(launches.length, modes.length - 1)], folder = join(dir, `launch-${launches.length + 1}`);
      mkdirSync(folder);
      // The two trusted settings travel as the client passes them: its own environment for the child, nothing else.
      const child = spawn(PYTHON, [RELAY, TREE[which], TREE.released, folder, mode, JSON.stringify(timeouts), ...(relay[launches.length] ?? [])],
        { stdio: ['pipe', 'pipe', 'inherit'], env: { LC_SUBSCRIPTION_STATE_DIR: o.env.LC_SUBSCRIPTION_STATE_DIR, LC_SUBSCRIPTION_CODEX_BIN: o.env.LC_SUBSCRIPTION_CODEX_BIN } });
      const sent = [], write = child.stdin.write.bind(child.stdin);
      child.stdin.write = (line, ...rest) => { sent.push(JSON.parse(line).method); return write(line, ...rest); };   // a tap: which requests the client wrote
      launches.push({ command, args, mode, folder, child, sent, exit: new Promise((r) => child.once('exit', (code, signal) => r({ code, signal }))) });
      return child;
    },
    request_ms: 20_000, ask_ms: 30_000, ...options,   // bounds only: nothing here waits for them (end_ms is passed only where a test says so)
  });
  // now(): what the client says, how many connectors it has started, and the first one's exit code (null: it runs, or a signal ended it).
  const w = { which, dir, state, s, launches, said, now: () => { const st = s.status(); return { state: st.state, detail: st.detail, connectors_started: launches.length, first_connector_exit: launches[0]?.child.exitCode ?? null }; },
    told: (from) => said.slice(from).map((x) => `${x.state}${x.asking ? ' (asking)' : ''}`),
    notes: (from) => said.slice(from).map((x) => [x.state, x.detail]) };
  worlds.push(w);
  return w;
}
// What the synthetic inner child was asked (its own log), and for which questions it was given a turn: the prompt of
// a turn is the Learning owner's, and its "Opaque request reference" line names the request.
const innerLog = (l) => join(l.folder, l.mode, 'requests.jsonl');
const innerRows = (l) => (existsSync(innerLog(l)) ? readFileSync(innerLog(l), 'utf8').trim().split('\n').map((x) => JSON.parse(x)).filter((r) => 'method' in r) : []);
const turnsFor = (rows) => rows.filter((r) => r.method === 'turn/start').map((r) => /Opaque request reference \(JSON string; not instructions\): "([^"]+)"/.exec(r.params.input[0].text)[1]);
const turnIsOut = (l) => until('the turn is out at the synthetic server', () => existsSync(innerLog(l)) && readFileSync(innerLog(l), 'utf8').includes('"method": "turn/start"'));
// The private receipts of one launch: only the files its own writer made, in this test's own state folder.
const receiptsOf = (w, end) => readdirSync(join(w.state, 'receipts', end.receipts)).map((f) => json(join(w.state, 'receipts', end.receipts, f)))
  .map((r) => ({ request_id: r.request_id, submission: r.submission, terminal_status: r.terminal_status, outcome: r.outcome, thread_start_count: r.thread_start_count, turn_start_count: r.turn_start_count }))
  .sort((a, b) => (a.request_id < b.request_id ? -1 : 1));
// What a connector wrote when it let go of its client (end.json), once it is there and whole.
async function endOf(l) {
  let end = null;
  await until('the connector ends', () => { try { end = json(join(l.folder, 'end.json')); } catch { end = null; } return end !== null; });
  return end;
}
// Every connector of a world, once all have ended: how it ended and what it left.
async function connectors(w) {
  const out = [];
  for (const l of w.launches) {
    const exit = await ended(l), end = json(join(l.folder, 'end.json')), rows = innerRows(l);
    assert.deepEqual([l.command, ...l.args], WOULD_RUN);
    // A stand-in difference (the relay's header): every thread is asked for with the helper's provider name, not a real launch's.
    for (const row of rows.filter((x) => x.method === 'thread/start')) assert.equal(row.params.modelProvider, 'openai');
    out.push({ exit, ended_by_itself: json(join(l.folder, 'relay.json')).output_ended_while_input_open, fatal: end.fatal, inner_exit: end.inner_returncode, stderr_bytes: statSync(join(l.folder, 'connector-stderr.txt')).size,
      bounds: end.limits, timeouts: end.timeouts, client_wrote: count(l.sent), inner_was_asked: count(rows.map((r) => r.method)), turns_for: turnsFor(rows), receipts: receiptsOf(w, end) });
  }
  return out;
}

// ---- the scenarios (the same steps for every commit) --------------------------------------------------------------------
// Check, a question, [a second question, the user's Check, a third question,] quit.
async function questions(which, modes, { timeouts = {}, more = true } = {}) {
  const w = world(which, modes, { timeouts }), r = {};
  await w.s.check();
  const { state, model, plan } = w.s.status();
  r.checked = [state, model, plan];
  const from = w.said.length;
  r.first = shown(await w.s.ask(ask('qa-ask-1')));
  r.told_during_first = w.told(from);
  r.after_first = w.now();
  if (more) {
    r.second = shown(await w.s.ask(ask('qa-ask-2')));
    await w.s.check();
    r.after_check = w.now();
    r.third = shown(await w.s.ask(ask('qa-ask-3')));
  }
  await w.s.quit();
  r.connectors = await connectors(w);
  r.inner_children = new Set(w.launches.map((l) => json(join(l.folder, 'end.json')).inner_pid)).size;
  return r;
}
// The connector's process ends the synthetic inner child it made (signal USR1 to the relay, which passes it on).
async function endInner(l) {
  l.child.kill('SIGUSR1');
  await until('the synthetic inner child is gone', () => existsSync(join(l.folder, 'inner-ended.json')));
}
// Check, the inner child ends with no question out, a question, the user's Check, a second question, quit.
async function idleLoss(which, connectorEnds) {
  const w = world(which, ['success']), r = {};
  await w.s.check();
  const from = w.said.length;
  await endInner(w.launches[0]);
  if (connectorEnds) await ended(w.launches[0]);   // BEFORE has nothing to wait for: its connector says nothing and stays
  r.told_after_loss = w.told(from);
  r.after_loss = w.now();
  r.first = shown(await w.s.ask(ask('qa-ask-1')));
  await w.s.check();
  r.after_check = w.now();
  r.second = shown(await w.s.ask(ask('qa-ask-2')));
  await w.s.quit();
  r.connectors = await connectors(w);
  r.inner_children = new Set(w.launches.map((l) => json(join(l.folder, 'end.json')).inner_pid)).size;
  return r;
}
// Check, a question whose turn is written to the synthetic server and never becomes known to the connector; while the
// connector waits, the inner child ends; then the user's Check, a second question, quit. Two modes of the repo's child:
//   start_error  it answers turn/start with an error: the connector then waits for the turn's id, up to 3 s, before it
//                gives the question up (the wait of its own interruption);
//   start_hang   it does not answer turn/start for 10 s: the connector waits for that answer (up to 15 s).
async function lossBeforeATurnIsKnown(which, mode) {
  const w = world(which, [mode, 'success']), r = {};
  await w.s.check();
  const from = w.said.length;
  const asked = w.s.ask(ask('qa-ask-1'));
  await turnIsOut(w.launches[0]);
  await pause(300);   // the connector has taken what the synthetic server did with the turn's start (start_error: its error answer) before the loss
  await endInner(w.launches[0]);
  r.first = shown(await asked);
  r.told_during_first = w.told(from);
  r.after_first = w.now();
  await w.s.check();
  r.after_check = w.now();
  r.second = shown(await w.s.ask(ask('qa-ask-2')));
  await w.s.quit();
  r.connectors = await connectors(w);
  return r;
}

// ---- the exact values -------------------------------------------------------------------------------------------------
const NOT_AVAILABLE = 'the connector, or the official Codex app server it runs, is not available';
const UNCERTAIN = { status: 'uncertain', reason: 'no answer came; whether ChatGPT worked on the question is not known' };
const LOCAL = { status: 'refused', code: 'local', reason: NOT_AVAILABLE };          // the client's own refusal: nothing is sent
const STALE = { status: 'refused', code: 'unavailable', reason: NOT_AVAILABLE };    // the connector's answer `unavailable`
const FAILED = 'ChatGPT did not complete an answer';
const answered = (id, text) => ({ status: 'answered', request_id: id, model: 'test-image-model', text: brief(text) });
const SIGNED_IN = ['signed_in', 'test-image-model', 'plus'];
const CORRECTED = { MAX_TURN_EVENTS: 4096, MAX_TURN_WIRE_BYTES: 32 * 1024 * 1024, MAX_HISTORY: 4096, SHUTDOWN_SECONDS: 8, TERMINAL_REPLY_SECONDS: 1 };
const BOUNDS = { released: CORRECTED, first_release: CORRECTED, before: { MAX_TURN_EVENTS: 4096, MAX_TURN_WIRE_BYTES: null, MAX_HISTORY: 4096, SHUTDOWN_SECONDS: 8, TERMINAL_REPLY_SECONDS: null } };
const TIMEOUTS = { rpc_timeout: 15, turn_timeout: 120, shutdown_timeout: 3 };   // the released constructor's own defaults
const is = (state, detail, started, exit) => ({ state, detail, connectors_started: started, first_connector_exit: exit });
const receipt = (id, submission, terminal, outcome, starts) => ({ request_id: id, submission, terminal_status: terminal, outcome, thread_start_count: starts, turn_start_count: starts });
// The inner child's log by method: its start, `reads` account reads (a Check or a question's own), `turns` turns.
const inner = (reads, turns, more = {}) => ({ initialize: 1, initialized: 1, ...(reads ? { 'account/read': reads, 'model/list': reads, 'account/rateLimits/read': reads } : {}), ...(turns ? { 'thread/start': turns, 'turn/start': turns } : {}), ...more });
const connector = (which, o) => ({ exit: { code: 0, signal: null }, stderr_bytes: 0, bounds: BOUNDS[which], timeouts: TIMEOUTS, ...o });
const wrote = (reads, asks, more = {}) => ({ 'connection/read': reads, ...(asks ? { 'ask/start': asks } : {}), ...more });
// The second connector of a RELEASED world, started by the user's Check: asked one new question, which is answered.
const fresh = (id) => connector('released', { ended_by_itself: false, fatal: null, inner_exit: -15, client_wrote: wrote(1, 1), inner_was_asked: inner(2, 1), turns_for: [id], receipts: [receipt(id, 'acknowledged', 'completed', 'completed', 1)] });

// RELEASED, a fatal failure of the inner client during the first question: the connector ends by itself, the question
// is uncertain, and only the user's Check starts a new connector, which is asked the third question and no other.
const releasedLoss = (fatal, innerExit) => ({
  checked: SIGNED_IN, first: UNCERTAIN, told_during_first: ['signed_in (asking)', 'unavailable (asking)', 'unavailable'], after_first: is('unavailable', null, 1, 0),
  second: LOCAL, after_check: is('signed_in', null, 2, 0), third: answered('qa-ask-3', 'Completed answer.'), inner_children: 2,
  connectors: [
    // QA NOTE: the client says 'uncertain' ("whether ChatGPT worked on the question is not known") while this
    // question's private receipt says outcome 'failed', with the turn acknowledged. Asserted as observed; reported.
    // (This 'failed' is written by the older generic branch of `_ask`, not by the corrected receipt code.)
    connector('released', { ended_by_itself: true, fatal, inner_exit: innerExit, client_wrote: wrote(1, 1), inner_was_asked: inner(2, 1), turns_for: ['qa-ask-1'], receipts: [receipt('qa-ask-1', 'acknowledged', null, 'failed', 1)] }),
    fresh('qa-ask-3'),
  ],
});
// BEFORE, the same failure: the connector answers `unavailable`, stays, and answers `unavailable` to everything after
// it. The client still says 'signed_in' until the user's Check, which is answered by the same dead connector.
const beforeStale = (fatal, innerExit, { stale = STALE, detail = NOT_AVAILABLE, terminal = null } = {}) => ({
  checked: SIGNED_IN, first: stale, told_during_first: ['signed_in (asking)', 'signed_in'], after_first: is('signed_in', null, 1, null),
  second: stale, after_check: is('unavailable', detail, 1, null), third: LOCAL, inner_children: 1,
  connectors: [connector('before', { ended_by_itself: false, fatal, inner_exit: innerExit, client_wrote: wrote(2, 2), inner_was_asked: inner(2, 1), turns_for: ['qa-ask-1'],
    receipts: [receipt('qa-ask-1', 'acknowledged', terminal, 'failed', 1), receipt('qa-ask-2', 'not_submitted', null, 'failed', 1)] })],
});

// ---- the three commits ------------------------------------------------------------------------------------------------
test('the three commits: FIRST_RELEASE and RELEASED have the same connector side (the tree ids of services, packages and pyproject.toml are equal) and differ in the Windows app only in src/main/subscription.ts; BEFORE has another connector', LIMIT, () => {
  const ids = Object.fromEntries(Object.entries(COMMITS).map(([which, commit]) => [which, treeIds(commit)]));
  const files = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => relative(dir, join(e.parentPath, e.name))).sort();
  const src = (which) => join(TREE[which], 'apps/windows/src');
  const differing = files(src('released')).filter((f) => !existsSync(join(src('first_release'), f)) || !readFileSync(join(src('released'), f)).equals(readFileSync(join(src('first_release'), f))));
  const seen = observed.three_commits = {
    connector_side_equal: Object.fromEntries(['services', 'packages', 'pyproject.toml'].map((part) => [part, { first_release_and_released: ids.first_release[part] === ids.released[part], before_and_released: ids.before[part] === ids.released[part] }])),
    app_tree_equal: { first_release_and_released: ids.first_release['apps/windows'] === ids.released['apps/windows'] },
    app_src_same_file_names: JSON.stringify(files(src('released'))) === JSON.stringify(files(src('first_release'))),
    app_src_files_that_differ: differing,
  };
  assert.deepEqual(seen, {
    connector_side_equal: { services: { first_release_and_released: true, before_and_released: false }, packages: { first_release_and_released: true, before_and_released: true }, 'pyproject.toml': { first_release_and_released: true, before_and_released: true } },
    app_tree_equal: { first_release_and_released: false }, app_src_same_file_names: true, app_src_files_that_differ: ['main/subscription.ts'],
  });
});

// ---- the stand-in child's text ------------------------------------------------------------------------------------------
test('the synthetic inner child: its BEFORE text is the RELEASED text without the delta and flood modes (and client() is the same), so the RELEASED text is run under every connector', LIMIT, () => {
  const source = (tree) => readFileSync(join(tree, 'services/worker/connectors/tests/test_chatgpt_rpc.py'), 'utf8');
  const fake = (text) => /^FAKE = r'''\n([\s\S]*?)^'''$/m.exec(text)[1], helper = (text) => /^def client\([\s\S]*?^    return instance$/m.exec(text)[0];
  const [was, now] = [source(TREE.before), source(TREE.released)];
  const from = fake(now).indexOf("        if mode.startswith('many_deltas_'):"), to = fake(now).indexOf("        if mode in ('hang','ignore_interrupt','late_complete'): continue");
  assert.ok(from > 0 && to > from);
  assert.equal(fake(now).slice(0, from) + fake(now).slice(to), fake(was));
  assert.equal(helper(now), helper(was));
  // the numbers and modes the tests below rely on, as that text has them
  for (const part of ["count=32000 if kind=='single' else 9000", "delta='' if kind=='empty' else 'x' if kind=='single' else 'abc'", 'for _ in range(10000):', "event('item/started',threadId='thread-1',turnId='turn-1',item={'type':'reasoning'})", "'x'*(16384 if kind=='line' else 256)", "if mode=='disconnect': sys.exit(0)",
    "if mode=='start_error':\n            send({'id':request['id'],'error':{'code':-1,'message':'TOKEN-secret'}}); continue", "if mode=='start_hang': time.sleep(10); continue",
    "result={'type':'chatgpt','loginId':'login-1','authUrl':'https://auth.openai.com/oauth/authorize?private=not-logged'}"]) assert.ok(fake(now).includes(part), part);
});

// ---- QA-SUB-03 --------------------------------------------------------------------------------------------------------
test('QA-SUB-03 RELEASED: a turn of 9000 delta notifications and then the completed answer is ANSWERED with the full 27000 characters, through the real prepare and bind, three times on one connector', LIMIT, async () => {
  const r = (observed.deltas_9000_then_answer ??= {}).released = await questions('released', ['many_deltas_agent']);
  const text = 'abc'.repeat(9000);   // what the synthetic server completes the turn with; compared by its length and digest
  assert.deepEqual(r, {
    checked: SIGNED_IN, first: answered('qa-ask-1', text), told_during_first: ['signed_in (asking)', 'signed_in'], after_first: is('signed_in', null, 1, null),
    second: answered('qa-ask-2', text), after_check: is('signed_in', null, 1, null), third: answered('qa-ask-3', text), inner_children: 1,
    connectors: [connector('released', { ended_by_itself: false, fatal: null, inner_exit: -15, client_wrote: wrote(2, 3), inner_was_asked: inner(5, 3), turns_for: ['qa-ask-1', 'qa-ask-2', 'qa-ask-3'],
      receipts: [1, 2, 3].map((n) => receipt(`qa-ask-${n}`, 'acknowledged', 'completed', 'completed', n)) })],
  });
});

test('QA-SUB-03 BEFORE (negative control): the same 9000-delta turn is killed at the 4096 count: the client shows a refusal `unavailable`, still says signed_in, and the connector stays and answers `unavailable` from then on', LIMIT, async () => {
  const r = (observed.deltas_9000_then_answer ??= {}).before = await questions('before', ['many_deltas_agent']);
  assert.deepEqual(r, beforeStale('protocol_error', -9));
});

test('QA-SUB-03 RELEASED, the lifecycle bound: a flood far over the bound still ends the turn; the value is read from the running connector\'s module. 10000 item/started notifications (the bound reads 4096; its level is not shown): the connector ends, the client shows the question as uncertain and the state unavailable; Check starts a new connector', LIMIT, async () => {
  const r = (observed.lifecycle_flood ??= {}).released = await questions('released', ['flood_lifecycle', 'success']);
  assert.deepEqual(r, releasedLoss('protocol_error', -9));
});

test('QA-SUB-03 BEFORE (negative control): the same lifecycle flood is answered `unavailable` by a connector that stays', LIMIT, async () => {
  const r = (observed.lifecycle_flood ??= {}).before = await questions('before', ['flood_lifecycle', 'success']);
  assert.deepEqual(r, beforeStale('protocol_error', -9));
});

test('QA-SUB-03 RELEASED, the byte allowance: a flood far over the bound still ends the turn; the value is read from the running connector\'s module. 10000 deltas of 16384 characters, about 164 MB (the allowance reads 32 MiB, not lowered; its level is not shown): uncertain, unavailable, the connector ends', LIMIT, async () => {
  // Deltas are not counted on RELEASED (the 9000-delta test), so of count and bytes only the bytes can end this turn.
  // The code is `protocol_error` for both bounds: that it is the byte bound is by that rule, not read off a counter.
  const r = (observed.byte_allowance ??= {}).released = await questions('released', ['flood_line', 'success']);
  assert.deepEqual(r, releasedLoss('protocol_error', -9));
});

test('QA-SUB-03 BEFORE (negative control): there is no byte allowance (the bound reads null); the same turn is ended with the same code and answered `unavailable` by a connector that stays', LIMIT, async () => {
  const r = (observed.byte_allowance ??= {}).before = await questions('before', ['flood_line', 'success']);
  assert.deepEqual(r, beforeStale('protocol_error', -9));
});

test('QA-SUB-03 RELEASED: 9000 deltas and no completed answer are ended by neither count nor bytes but by the turn\'s time bound (2 s here): a refusal `failed`, the connector stays usable, the receipt says uncertain', LIMIT, async () => {
  const r = (observed.deltas_9000_no_answer ??= {}).released = await questions('released', ['many_deltas_incomplete'], { timeouts: { turn_timeout: 2 }, more: false });
  assert.deepEqual(r, {
    checked: SIGNED_IN, first: { status: 'refused', code: 'failed', reason: FAILED }, told_during_first: ['signed_in (asking)', 'signed_in'], after_first: is('signed_in', null, 1, null), inner_children: 1,
    // QA NOTE: here the client shows a known refusal ('failed', "ChatGPT did not complete an answer") while the
    // receipt says outcome 'uncertain' (the turn was interrupted at the time bound, and the synthetic server
    // confirmed it). Asserted as observed; reported.
    connectors: [{ ...connector('released', { ended_by_itself: false, fatal: null, inner_exit: -15, client_wrote: wrote(1, 1), inner_was_asked: inner(2, 1, { 'turn/interrupt': 1 }), turns_for: ['qa-ask-1'],
      receipts: [receipt('qa-ask-1', 'acknowledged', 'interrupted', 'uncertain', 1)] }), timeouts: { ...TIMEOUTS, turn_timeout: 2 } }],
  });
});

test('QA-SUB-03 BEFORE (negative control): the same turn never reaches the time bound: it is killed by the 4096 count at once and answered `unavailable`', LIMIT, async () => {
  const r = (observed.deltas_9000_no_answer ??= {}).before = await questions('before', ['many_deltas_incomplete'], { timeouts: { turn_timeout: 2 }, more: false });
  assert.deepEqual(r, {
    checked: SIGNED_IN, first: STALE, told_during_first: ['signed_in (asking)', 'signed_in'], after_first: is('signed_in', null, 1, null), inner_children: 1,
    connectors: [{ ...connector('before', { ended_by_itself: false, fatal: 'protocol_error', inner_exit: -9, client_wrote: wrote(1, 1), inner_was_asked: inner(2, 1), turns_for: ['qa-ask-1'],
      receipts: [receipt('qa-ask-1', 'acknowledged', null, 'failed', 1)] }), timeouts: { ...TIMEOUTS, turn_timeout: 2 } }],
  });
});

// ---- QA-SUB-02 --------------------------------------------------------------------------------------------------------
test('QA-SUB-02 RELEASED: the inner App Server ends during a turn: the connector ends its own output with its input still open and exits 0; the client shows uncertain and unavailable; nothing is started or sent again until the user\'s Check, which starts a new connector with a new inner child; no question is replayed; a new question is answered', LIMIT, async () => {
  const r = (observed.inner_ends_during_a_turn ??= {}).released = await questions('released', ['disconnect', 'success']);
  assert.deepEqual(r, releasedLoss('unavailable', 0));
  // said again, on its own: across both inner children one turn per question that was sent, and none for the lost one in the new child
  assert.deepEqual(r.connectors.map((c) => [c.inner_was_asked['thread/start'], c.inner_was_asked['turn/start'], c.client_wrote['ask/start'], c.turns_for]), [[1, 1, 1, ['qa-ask-1']], [1, 1, 1, ['qa-ask-3']]]);
});

test('QA-SUB-02 BEFORE (negative control): the connector stays alive after the same failure and keeps answering `unavailable`: the first and a second question are refused by it, the user\'s Check shows unavailable with its wording, and no new connector is ever started', LIMIT, async () => {
  const r = (observed.inner_ends_during_a_turn ??= {}).before = await questions('before', ['disconnect', 'success']);
  assert.deepEqual(r, beforeStale('unavailable', 0));
});

test('QA-SUB-02 RELEASED: a fatal failure that is not the server\'s end (it reports a usage-limit error on the turn): the same as for its end: the connector ends by itself, the question is uncertain, the state unavailable; the user\'s Check starts a new connector', LIMIT, async () => {
  // QA NOTE: on RELEASED the usage limit is not said for this failure (no answer of the connector reaches the client):
  // the question is shown as 'uncertain' and the state as 'unavailable' with no detail, where BEFORE (next test) said
  // "the subscription's usage limit was reached". Asserted as observed; reported.
  const r = (observed.inner_reports_an_error_on_the_turn ??= {}).released = await questions('released', ['retry_error', 'success']);
  assert.deepEqual(r, releasedLoss('quota_exhausted', -9));
});

test('QA-SUB-02 BEFORE (negative control): after the same error the connector stays and repeats the old code `quota`: to the question, to the next question, and to the user\'s Check, which shows unavailable with "the subscription\'s usage limit was reached"; no new connector is started', LIMIT, async () => {
  const r = (observed.inner_reports_an_error_on_the_turn ??= {}).before = await questions('before', ['retry_error', 'success']);
  // QA NOTE: BEFORE keeps reading the dead server's output after the fatal error, so whether this receipt also took the
  // turn's completion ('completed') or not (null) is a matter of timing. Both are accepted, and written as one text.
  const first = r.connectors[0].receipts[0];
  assert.ok([null, 'completed'].includes(first.terminal_status));
  first.terminal_status = 'completed or null';
  const QUOTA = 'the subscription\'s usage limit was reached';
  assert.deepEqual(r, beforeStale('quota_exhausted', -9, { stale: { status: 'refused', code: 'quota', reason: QUOTA }, detail: QUOTA, terminal: 'completed or null' }));
});

test('QA-SUB-02 RELEASED: another fatal failure (the server asks for a tool, which the connector refuses): the same again: the connector ends by itself, uncertain, unavailable; the user\'s Check starts a new connector', LIMIT, async () => {
  const r = (observed.inner_asks_for_a_tool ??= {}).released = await questions('released', ['server_request', 'success']);
  assert.deepEqual(r, releasedLoss('tool_activity', -9));
});

test('QA-SUB-02 BEFORE (negative control): after the same failure the connector stays and repeats the old code `failed`: the user\'s Check, an account read, shows unavailable with "ChatGPT did not complete an answer"', LIMIT, async () => {
  const r = (observed.inner_asks_for_a_tool ??= {}).before = await questions('before', ['server_request', 'success']);
  assert.deepEqual(r, beforeStale('tool_activity', -9, { stale: { status: 'refused', code: 'failed', reason: FAILED }, detail: FAILED }));
});

test('QA-SUB-02 RELEASED: the inner App Server ends while idle: the connector ends by itself and exits 0, the client is told unavailable with no question out; a question is refused locally; the user\'s Check starts a new connector, which answers', LIMIT, async () => {
  const r = (observed.inner_ends_while_idle ??= {}).released = await idleLoss('released', true);
  assert.deepEqual(r, {
    told_after_loss: ['unavailable'], after_loss: is('unavailable', null, 1, 0), first: LOCAL, after_check: is('signed_in', null, 2, 0), second: answered('qa-ask-2', 'Completed answer.'), inner_children: 2,
    connectors: [
      connector('released', { ended_by_itself: true, fatal: 'unavailable', inner_exit: -15, client_wrote: wrote(1, 0), inner_was_asked: inner(1, 0), turns_for: [], receipts: [] }),
      fresh('qa-ask-2'),
    ],
  });
});

test('QA-SUB-02 BEFORE (negative control): after the same idle loss the client is told nothing and still says signed_in; the question goes to the dead connector and is refused `unavailable`; the user\'s Check shows unavailable from the same connector', LIMIT, async () => {
  const r = (observed.inner_ends_while_idle ??= {}).before = await idleLoss('before', false);
  assert.deepEqual(r, {
    told_after_loss: [], after_loss: is('signed_in', null, 1, null), first: STALE, after_check: is('unavailable', NOT_AVAILABLE, 1, null), second: LOCAL, inner_children: 1,
    connectors: [connector('before', { ended_by_itself: false, fatal: 'unavailable', inner_exit: -15, client_wrote: wrote(2, 1), inner_was_asked: inner(1, 0), turns_for: [], receipts: [receipt('qa-ask-1', 'not_submitted', null, 'failed', 0)] })],
  });
});

// ---- the receipt part of the Backend correction: the one path of it this file reaches ------------------------------------
test('QA-SUB-02 RELEASED, the receipt of a question the connector\'s own close cancels: the server refuses to start the turn, and while the connector still waits for that turn the inner App Server ends. The connector waits its grace second, then closes: the question is NOT marked cancelled, its receipt says `uncertain` with the turn written and not acknowledged, the client shows uncertain; the user\'s Check starts a new connector', LIMIT, async () => {
  // The path: run_stream's grace second runs out with the question's task still waiting, so bridge.close(terminal_failure=True)
  // cancels that task, and `_ask` takes its CancelledError branch with `client.terminal` set: _unfinished_outcome().
  // Here the client's 'uncertain' and the receipt's 'uncertain' agree (compare the QA NOTE in releasedLoss).
  const r = (observed.inner_ends_after_a_refused_turn_start ??= {}).released = await lossBeforeATurnIsKnown('released', 'start_error');
  assert.deepEqual(r, {
    first: UNCERTAIN, told_during_first: ['signed_in (asking)', 'unavailable (asking)', 'unavailable'], after_first: is('unavailable', null, 1, 0),
    after_check: is('signed_in', null, 2, 0), second: answered('qa-ask-2', 'Completed answer.'),
    connectors: [
      connector('released', { ended_by_itself: true, fatal: 'unavailable', inner_exit: -15, client_wrote: wrote(1, 1), inner_was_asked: inner(2, 1), turns_for: ['qa-ask-1'], receipts: [receipt('qa-ask-1', 'written', null, 'uncertain', 1)] }),
      fresh('qa-ask-2'),
    ],
  });
});

test('QA-SUB-02 BEFORE (negative control): the same loss: the connector stays, gives the question up after its 3 s wait and answers `failed`, a known refusal; its receipt says `failed`; the user\'s Check shows unavailable from the same connector', LIMIT, async () => {
  const r = (observed.inner_ends_after_a_refused_turn_start ??= {}).before = await lossBeforeATurnIsKnown('before', 'start_error');
  assert.deepEqual(r, {
    first: { status: 'refused', code: 'failed', reason: FAILED }, told_during_first: ['signed_in (asking)', 'signed_in'], after_first: is('signed_in', null, 1, null),
    after_check: is('unavailable', NOT_AVAILABLE, 1, null), second: LOCAL,
    connectors: [connector('before', { ended_by_itself: false, fatal: 'unavailable', inner_exit: -15, client_wrote: wrote(2, 1), inner_was_asked: inner(2, 1), turns_for: ['qa-ask-1'], receipts: [receipt('qa-ask-1', 'written', null, 'failed', 1)] })],
  });
});

test('QA-SUB-02 RELEASED, the receipt of a question lost before its turn\'s start was answered: the inner App Server ends while the connector waits for the answer to turn/start. The connector ends by itself and the client shows uncertain, as for every fatal failure; the receipt says `failed` with the turn written and not acknowledged', LIMIT, async () => {
  // QA NOTE: the sharpest form of the note in releasedLoss. The turn's start was written, the server ended without
  // answering it, the client says "whether ChatGPT worked on the question is not known", and the private receipt says
  // outcome 'failed'. It is written by the older generic branch of `_ask` (any fatal code but outcome_unknown, uncertain
  // and timeout is 'failed'), not by the corrected receipt code. Asserted as observed; reported.
  const r = (observed.inner_ends_before_the_turn_start_is_answered ??= {}).released = await lossBeforeATurnIsKnown('released', 'start_hang');
  assert.deepEqual(r, {
    first: UNCERTAIN, told_during_first: ['signed_in (asking)', 'unavailable (asking)', 'unavailable'], after_first: is('unavailable', null, 1, 0),
    after_check: is('signed_in', null, 2, 0), second: answered('qa-ask-2', 'Completed answer.'),
    connectors: [
      connector('released', { ended_by_itself: true, fatal: 'unavailable', inner_exit: -15, client_wrote: wrote(1, 1), inner_was_asked: inner(2, 1), turns_for: ['qa-ask-1'], receipts: [receipt('qa-ask-1', 'written', null, 'failed', 1)] }),
      fresh('qa-ask-2'),
    ],
  });
});

test('QA-SUB-02 BEFORE (negative control): the same loss: the connector stays and answers `unavailable`, a known refusal; the receipt is the same (`failed`, written, not acknowledged); the user\'s Check shows unavailable from the same connector', LIMIT, async () => {
  const r = (observed.inner_ends_before_the_turn_start_is_answered ??= {}).before = await lossBeforeATurnIsKnown('before', 'start_hang');
  assert.deepEqual(r, {
    first: STALE, told_during_first: ['signed_in (asking)', 'signed_in'], after_first: is('signed_in', null, 1, null),
    after_check: is('unavailable', NOT_AVAILABLE, 1, null), second: LOCAL,
    connectors: [connector('before', { ended_by_itself: false, fatal: 'unavailable', inner_exit: -15, client_wrote: wrote(2, 1), inner_was_asked: inner(2, 1), turns_for: ['qa-ask-1'], receipts: [receipt('qa-ask-1', 'written', null, 'failed', 1)] })],
  });
});

// ---- the Windows lifecycle follow-up: what RELEASED changed after FIRST_RELEASE, on all three commits --------------------
test('follow-up W-KNOWN-CANCEL (before / first_release / released): after 4096 requests the connector cancels the question that is out by itself; the client never asked for it. BEFORE and FIRST_RELEASE show { cancelled, uncertain: false }, as certain; RELEASED shows { cancelled, uncertain: true }. On all three the connector then stays alive and answers `unavailable` to everything', LONG, async () => {
  const one = async (which) => {
    const w = world(which, ['late_complete']), r = { reads_answered_signed_in: 0 };
    // 4095 Checks and the question make 4096 requests: the connector's own history bound (its MAX_HISTORY, not lowered).
    for (let n = 0; n < 4095; n += 1) { await w.s.check(); if (w.s.status().state === 'signed_in') r.reads_answered_signed_in += 1; }
    const asked = w.s.ask(ask('qa-ask-1'));
    await turnIsOut(w.launches[0]);
    await w.s.check();                                   // request 4097: refused, and it cancels the question that is out
    r.after_the_bound = w.now();
    r.question = shown(await asked);
    await w.s.check();
    r.after_another_check = w.now();
    r.next_question = shown(await w.s.ask(ask('qa-ask-2')));
    await w.s.quit();
    r.connectors = await connectors(w);
    return r;
  };
  const seen = observed.unsolicited_cancelled = Object.fromEntries(await Promise.all(THREE.map(async (which) => [which, await one(which)])));
  const expected = (which, uncertain) => ({
    reads_answered_signed_in: 4095, after_the_bound: is('unavailable', NOT_AVAILABLE, 1, null), question: { status: 'cancelled', uncertain },
    // QA NOTE: from the bound on, this connector answers every request `unavailable` and stays alive, so the user's
    // Check cannot start a new one and no question can be sent until the app is quit (the same shape as QA-SUB-02,
    // here after 4096 requests). The same on all three commits. Asserted as observed; reported.
    after_another_check: is('unavailable', NOT_AVAILABLE, 1, null), next_question: LOCAL,
    // The client wrote no ask/cancel. The connector interrupted the turn by itself; the synthetic server then
    // completed it (terminal status 'completed'), and the receipt says outcome 'cancelled'.
    connectors: [connector(which, { ended_by_itself: false, fatal: null, inner_exit: -15, client_wrote: wrote(4097, 1), inner_was_asked: inner(4096, 1, { 'turn/interrupt': 1 }), turns_for: ['qa-ask-1'],
      receipts: [receipt('qa-ask-1', 'acknowledged', 'completed', 'cancelled', 1)] })],
  });
  assert.deepEqual(seen, { before: expected('before', false), first_release: expected('first_release', false), released: expected('released', true) });
});

// The follow-up's note of a connector that was ended here and whose own end was not seen (RELEASED only).
const END_NOT_SEEN = (shim) => `a connector that was ended here did not end by itself in time; ${shim} that the connector, or the Codex app server it runs, ended in WSL`;
const SHIM_ENDED = END_NOT_SEEN('its wsl.exe shim was ended, which does not show');
const SHIM_NOT_ENDED = END_NOT_SEEN('its wsl.exe shim did not end either, so it is not known');
// The default bound of a connector's end, as the client's source has it: the number in fence(), or the constant named there.
const defaultEndMs = (which) => {
  const text = readFileSync(join(TREE[which], CLIENT), 'utf8'), number = (v) => Number(v.replaceAll('_', ''));
  const used = /endChild\(child\.proc, \(\) => child\.proc\.stdin\?\.end\(\), child\.exited, this\.o\.end_ms \?\? (\w+), 'wsl'\)/.exec(text)[1];
  return /^[\d_]+$/.test(used) ? number(used) : number(new RegExp(`^export const ${used} = ([\\d_]+);$`, 'm').exec(text)[1]);
};
const HELD_S = 8.2;   // longer than FIRST_RELEASE's 5 s, shorter than RELEASED's 10 s
// How long quit() took, said as the span it fell in (no raw time is asserted or written).
const span = (ms) => (ms < 4_900 ? 'under 4.9 s' : ms < HELD_S * 1000 ? 'from 4.9 s to under 8.2 s' : ms < 9_900 ? 'from 8.2 s to under 9.9 s' : ms < 11_000 ? 'from 9.9 s to under 11 s' : '11 s or more');
// Check, then quit with the relay holding the connector's end back; what the quit took, how the shim ended and what
// the client says after it. No end_ms unless `options` has one: the client's own default bound.
async function quitWithTheEndHeld(which, held, options = {}) {
  const w = world(which, ['success'], { options, relay: [[held]] }), r = {}, l = () => w.launches[0];
  await w.s.check();
  const from = w.said.length, t0 = performance.now();
  r.quit_resolved_with = (await w.s.quit()) ?? 'nothing';
  r.quit_took = span(performance.now() - t0);
  r.shim_exit = await ended(l());
  r.client_signalled_the_shim = l().child.killed;
  r.shim_saw_the_connector_end = existsSync(join(l().folder, 'relay.json')) ? json(join(l().folder, 'relay.json')) : 'no';
  r.told_from_the_quit = w.notes(from);
  r.after_quit = w.now();
  return { w, r, end: await endOf(l()) };   // the connector itself: ended in time, or left behind and ended once the shim was gone
}

test('follow-up W-KNOWN-END-BUDGET, the default bound by behaviour (before / first_release / released): a connector whose end comes 8.2 s after the end of its input. BEFORE and FIRST_RELEASE end the shim at their 5 s and say nothing; RELEASED waits, sees the connector\'s own end, does not signal the shim and has no note. And RELEASED with an end that never comes: the shim is ended at 10 s and the note is said', LONG, async () => {
  const one = async (which) => {
    const { r, end } = await quitWithTheEndHeld(which, `hold-input-end=${HELD_S}`);
    // read, not waited for: the client's default as its source has it, and the two bounds of the running connector
    return { client_default_end_ms_as_written: defaultEndMs(which), connector_allows_itself_s: end.limits.SHUTDOWN_SECONDS, inner_close_waits_s: end.timeouts.shutdown_timeout, ...r, connector_then: { fatal: end.fatal, inner_exit: end.inner_returncode } };
  };
  const never = async () => { const { r, end } = await quitWithTheEndHeld('released', 'hold-input-end'); return { ...r, connector_left_behind_then: { fatal: end.fatal, inner_exit: end.inner_returncode } }; };
  const [end_after_8_2_s, released_end_never] = await Promise.all([Promise.all(THREE.map(async (which) => [which, await one(which)])).then(Object.fromEntries), never()]);
  observed.end_bound_default = { end_after_8_2_s, released_end_never };
  const gaveUp = {
    client_default_end_ms_as_written: 5000, connector_allows_itself_s: 8, inner_close_waits_s: 3, quit_resolved_with: 'nothing', quit_took: 'from 4.9 s to under 8.2 s',
    shim_exit: { code: null, signal: 'SIGTERM' }, client_signalled_the_shim: true, shim_saw_the_connector_end: 'no',
    // Nothing tells this from an orderly end: one notification, and no detail.
    told_from_the_quit: [['unavailable', null]], after_quit: is('unavailable', null, 1, null), connector_then: { fatal: null, inner_exit: -15 },
  };
  assert.deepEqual(end_after_8_2_s, {
    before: gaveUp, first_release: gaveUp,
    released: { ...gaveUp, client_default_end_ms_as_written: 10000, quit_took: 'from 8.2 s to under 9.9 s', shim_exit: { code: 0, signal: null }, client_signalled_the_shim: false,
      shim_saw_the_connector_end: { exit_code: 0, output_ended_while_input_open: false }, after_quit: is('unavailable', null, 1, 0) },
  });
  // RELEASED at its own default bound: the 10 s are waited for here, once.
  assert.deepEqual(released_end_never, {
    quit_resolved_with: 'nothing', quit_took: 'from 9.9 s to under 11 s', shim_exit: { code: null, signal: 'SIGTERM' }, client_signalled_the_shim: true, shim_saw_the_connector_end: 'no',
    told_from_the_quit: [['unavailable', null], ['unavailable', SHIM_ENDED]], after_quit: is('unavailable', SHIM_ENDED, 1, null), connector_left_behind_then: { fatal: null, inner_exit: -15 },
  });
});

test('follow-up W-KNOWN-END-BUDGET, a connector whose own end was not seen (before / first_release / released; end_ms 200 here, the end held longer): all three end the shim. BEFORE and FIRST_RELEASE say nothing of it. RELEASED keeps a note in status().detail, starts nothing in its place by itself, and the note is still there after the user\'s Check (which starts a new connector, usable), and after that one\'s orderly end', LIMIT, async () => {
  // Durable quit reporting is NOT shown: the note is in the client object only (see NOT SHOWN in the header).
  const one = async (which) => {
    const { w, r, end } = await quitWithTheEndHeld(which, 'hold-input-end', { end_ms: 200 });
    r.connector_left_behind_then = { fatal: end.fatal, inner_exit: end.inner_returncode };
    await pause(300);
    r.a_while_later = w.now();                           // nothing was started by itself
    const from = w.said.length;
    await w.s.check();                                   // the user's Check
    r.told_from_the_check = w.notes(from);
    r.after_check = w.now();
    r.question = shown(await w.s.ask(ask('qa-ask-1')));
    await w.s.quit();                                    // the second connector is not held: it ends in time
    r.second_connector = { exit: await ended(w.launches[1]), shim_saw_the_connector_end: json(join(w.launches[1].folder, 'relay.json')) };
    r.after_second_quit = w.now();
    return r;
  };
  const seen = observed.end_not_seen = Object.fromEntries(await Promise.all(THREE.map(async (which) => [which, await one(which)])));
  const expected = (note) => ({
    quit_resolved_with: 'nothing', quit_took: 'under 4.9 s', shim_exit: { code: null, signal: 'SIGTERM' }, client_signalled_the_shim: true, shim_saw_the_connector_end: 'no',
    told_from_the_quit: [['unavailable', null], ...(note ? [['unavailable', note]] : [])], after_quit: is('unavailable', note, 1, null),
    connector_left_behind_then: { fatal: null, inner_exit: -15 }, a_while_later: is('unavailable', note, 1, null),
    told_from_the_check: [['checking', note], ['signed_in', note]], after_check: is('signed_in', note, 2, null), question: answered('qa-ask-1', 'Completed answer.'),
    second_connector: { exit: { code: 0, signal: null }, shim_saw_the_connector_end: { exit_code: 0, output_ended_while_input_open: false } }, after_second_quit: is('unavailable', note, 2, null),
  });
  assert.deepEqual(seen, { before: expected(null), first_release: expected(null), released: expected(SHIM_ENDED) });
});

test('follow-up W-KNOWN-END-BUDGET, a shim that does not end when killed (before / first_release / released; end_ms 200 here): every client waits 2 s more and then lets go. BEFORE and FIRST_RELEASE say nothing. RELEASED says that the shim did not end either; when the shim ends later, it says that much and still not the connector\'s end', LIMIT, async () => {
  const one = async (which) => {
    const w = world(which, ['success'], { options: { end_ms: 200 }, relay: [['hold-input-end', 'ignore-term']] }), r = {};
    await w.s.check();
    const from = w.said.length, l = w.launches[0];
    r.quit_resolved_with = (await w.s.quit()) ?? 'nothing';   // the 200 ms, the client's kill (SIGTERM, which this stand-in shim ignores), and the client's 2 s wait
    r.shim_still_runs = l.child.exitCode === null && l.child.signalCode === null;
    r.client_signalled_the_shim = l.child.killed;
    r.after_quit = w.now();
    l.child.kill('SIGKILL');                             // the test ends its own stand-in shim
    r.shim_exit = await ended(l);
    await new Promise((done) => setImmediate(done));     // what the client does at its child's exit has run
    r.after_the_shim_ended = w.now();
    r.told_from_the_quit = w.notes(from);
    const end = await endOf(l);
    r.connector_left_behind_then = { fatal: end.fatal, inner_exit: end.inner_returncode };
    return r;
  };
  const seen = observed.shim_not_ended = Object.fromEntries(await Promise.all(THREE.map(async (which) => [which, await one(which)])));
  const expected = (first, then) => ({
    quit_resolved_with: 'nothing', shim_still_runs: true, client_signalled_the_shim: true, after_quit: is('unavailable', first, 1, null),
    shim_exit: { code: null, signal: 'SIGKILL' }, after_the_shim_ended: is('unavailable', then, 1, null),
    told_from_the_quit: [['unavailable', null], ...(first ? [['unavailable', first], ['unavailable', then]] : [])], connector_left_behind_then: { fatal: null, inner_exit: -15 },
  });
  assert.deepEqual(seen, { before: expected(null, null), first_release: expected(null, null), released: expected(SHIM_NOT_ENDED, SHIM_ENDED) });
});

test('follow-up, the changed wording at a quit with a sign-in pending (before / first_release / released): BEFORE and FIRST_RELEASE say "the connector ended before the sign-in completed"; RELEASED says "the connector was ended here before the sign-in completed". The connector ended in time on all three, and nothing was opened', LIMIT, async () => {
  const one = async (which) => {
    const opened = [];
    const w = world(which, ['success'], { options: { openExternal: (url) => { opened.push(url); } } }), r = {};   // a recorder: nothing is opened
    const says = () => { const st = w.s.status(); return { state: st.state, login: st.login, detail: st.detail }; };
    await w.s.check();
    await w.s.login();                                   // the synthetic child's "sign-in": an address of its own text, no account
    r.sign_in_pending = says();
    r.address_given_to_the_recorder = opened;
    await w.s.quit();
    r.after_quit = says();
    r.connectors = await connectors(w);
    return r;
  };
  const seen = observed.quit_with_a_sign_in_pending = Object.fromEntries(await Promise.all(THREE.map(async (which) => [which, await one(which)])));
  const expected = (which, pending, detail) => ({
    sign_in_pending: { state: 'signed_in', login: 'waiting', detail: pending }, address_given_to_the_recorder: ['https://auth.openai.com/oauth/authorize?private=not-logged'],
    after_quit: { state: 'unavailable', login: 'failed', detail },
    connectors: [connector(which, { ended_by_itself: false, fatal: null, inner_exit: -15, client_wrote: wrote(1, 0, { 'connection/login/start': 1 }), inner_was_asked: inner(1, 0, { 'account/login/start': 1 }), turns_for: [], receipts: [] })],
  });
  // (BEFORE says nothing beside a pending sign-in: that note came with the first correction and is another file's subject.)
  const PENDING = 'a sign-in started here is still pending: finish it in your browser, or cancel it';
  assert.deepEqual(seen, {
    before: expected('before', null, 'the connector ended before the sign-in completed'),
    first_release: expected('first_release', PENDING, 'the connector ended before the sign-in completed'),
    released: expected('released', PENDING, 'the connector was ended here before the sign-in completed'),
  });
});

// ---- the stand-ins stayed stand-ins -------------------------------------------------------------------------------------
test('in every launch of this file the codex stand-in was never run, and every relay has ended', LIMIT, async () => {
  assert.ok(worlds.length > 0 && worlds.every((w) => w.launches.length > 0));
  for (const w of worlds) {
    assert.equal(existsSync(join(w.dir, 'stand-in-codex')), true);
    assert.equal(existsSync(join(w.dir, 'stand-in-codex-was-run')), false);
    for (const l of w.launches) assert.ok(await ended(l));
  }
  observed.launches = { clients: worlds.length, connectors: worlds.reduce((n, w) => n + w.launches.length, 0), codex_stand_in_runs: 0 };
});
