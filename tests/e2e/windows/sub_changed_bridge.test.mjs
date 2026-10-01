// node --test tests/e2e/windows/sub_changed_bridge.test.mjs   (no Windows, no display, no account, no network)
//
// The changed paths of the Windows subscription client: QA-SUB-05, 06, 07, the app's side of QA-SUB-02, and the Windows
// lifecycle follow-up (an unasked "cancelled"; a connector that does not end when the app ends it). Three commits:
//   RELEASED       c44e620  the source the lead released: FIRST_RELEASE plus the lifecycle follow-up (subscription.ts only)
//   FIRST_RELEASE  8eac9fc  the first combined correction of QA-SUB-01..08
//   BEFORE         3e4b406  the candidate QA found the defects on: the negative control of every correction
// A case runs all three (its name says "on THREE commits") where RELEASED and FIRST_RELEASE differ, and in two places
// where the point is that they do NOT: the app's own Cancel and Stop in the "cancelled" table, and the retained
// controls. Everywhere else RELEASED and BEFORE are run: FIRST_RELEASE is not run there, and nothing is said about it.
//
// REAL: the class `Subscription` of apps/windows/src/main/subscription.ts with everything it imports, exactly as
//   committed: a new `git archive` of each commit, every file compared with the commit's blob id (sub_tree.mjs), never
//   this worktree's apps/. Node runs the .ts. Its requests and the answers go over REAL pipes to a real child process.
// STAND-INS:
//   - the connector is QA's qa_fake_bridge.py (this folder), scripted per case. It is not the Backend's connector: no
//     line of chatgpt_local.py or chatgpt_rpc.py runs here, and there is no Codex, no ChatGPT and no sign-in. So this
//     file shows what the APP does with a given answer, not that the real connector gives that answer.
//   - `spawn`: the app would run `wsl.exe --distribution .. --user .. --cd <folder> --exec <python> -m <module>`. That
//     command is recorded, and the project's Python runs the stand-in in that folder instead. No wsl.exe, no .exe. So
//     "its wsl.exe shim" in the app's words is, here, the stand-in's own Linux process: the app ends it with SIGTERM.
//   - `openExternal`: a recorder. It opens nothing; for two cases it is made to reject, as a browser that cannot open.
//   - there is no window: what the app tells its windows (`notify`, `status()`) is read. The sentences the control
//     window makes of it (control.ts) are not run here.
//   - the app's time bounds are options of the class. request_ms and ask_ms are LONG (20 s) whenever a request may be
//     the one that starts the stand-in, so that a slow start is never taken for "no answer"; they are set to HELD
//     (0.8 s) only right before a step the stand-in is scripted not to answer (the class reads them at each request)
//     and set back after it. One exception: for a refused address whose cancel gets no answer, the bound is lowered
//     before the sign-in start too, which the stand-in (already running by then) does answer. end_ms is 5 s, 0.3 s in
//     the two cases of a connector that does not end, and NOT passed in the case of the app's own end bound. change_window_ms is passed in the 64-reads case only; every other case runs the
//     app's own 10 s window.
// The test also listens on the connector's output pipe beside the app (a second listener on the same stream), only to
// know which lines the app has been handed; it changes nothing the app reads.
//
// Every test has a time limit (`limited`), and whatever a test started is ended when it is over, so a change that makes
// the app read or wait without end FAILS here instead of hanging the run. The cases that only wait (2 s, 3 s, 7 s) and
// the run of the stand-in's own self-test are side by side in one `describe`; all others run one after another.
//
// NOT SHOWN by this file:
//   - anything of the real connector: that it answers a question "cancelled" unasked, that it outlives the end of its
//     input, how many "changed" it writes for one change of the account. Only what the app does IF it does.
//   - wsl.exe and Windows: how a process is ended there, and whether "its wsl.exe shim did not end either" can happen
//     there at all (here it is reached by a stand-in that ignores SIGTERM).
//   - that the note about a connector whose end was not seen survives the app's quit (it is kept in memory only), and
//     what is said when more than one connector's end was not seen.
//   - the app ending a connector for an over-long line WHILE a sign-in waits (the stand-in writes that line only as the
//     answer to a question, and RELEASED sends no question then). "ended here before the sign-in completed" is shown
//     for the refused address and for the quit.
//   - the control window's sentences, the main process's wiring of the class (main.ts, preload), and QA-SUB-04's
//     refusal of a malformed question (made before this class).
//   - the app's own request_ms (30 s) and ask_ms (300 s), and the 10 s change window running out by itself.
//   - an absence past the time it was watched: "nothing starts by itself" is 2 s (3 s in the does-not-end case).
//
// QA_EVIDENCE=<existing folder> writes sub_changed_bridge.json there (sub_tree.mjs `evidence`): what each case saw on
// each commit it ran, only if every test passed.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, afterEach, describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FAKE_ASKS, FAKE_BRIDGE_SCRIPT, REHEARSAL_BRIDGE_SCRIPT, SURFACE_QUESTION } from './scenarios.mjs';
import { BEFORE, FIRST_RELEASE, PYTHON, RELEASED, REPO, evidence, exportTree } from './sub_tree.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRIDGE = join(HERE, 'qa_fake_bridge.py');
const COMMITS = { released: RELEASED, first_release: FIRST_RELEASE, before: BEFORE };
const Module = {};
for (const [tree, commit] of Object.entries(COMMITS)) Module[tree] = await import(pathToFileURL(join(exportTree(commit), 'apps', 'windows', 'src', 'main', 'subscription.ts')).href);

// ---- the app's fixed words, as QA expects them (each is compared whole) ------------------------------------------------
const UNAVAILABLE = 'the connector, or the official Codex app server it runs, is not available';
const NO_ANSWER = 'the connector did not answer';
const OTHER_FORM = 'the connector answered in a form this app does not read';
const NOT_READ_AGAIN = 'the account may have changed since it was last read, and it is not read again by itself; check again';
const NOT_READ_AGAIN_BEFORE = 'the account changed again while it was being read; check again';
const CANCELLING = 'the sign-in is being cancelled';
const NOT_CONFIRMED = 'the cancel of the sign-in was not confirmed: it may still be pending in the connector; cancel it again';
const NOT_HELD = 'the connector no longer holds that sign-in; whether it completed is not known (check the connection)';
const NOT_OPENED = 'the sign-in address the connector gave is not an official ChatGPT address, so it was not opened';
const ENDED_FOR_IT = `${NOT_OPENED}; the connector did not confirm that it let that sign-in go, so that connector is no longer used and is being ended (check the connection to start one again)`;
const ENDED_FOR_IT_FIRST_RELEASE = `${NOT_OPENED}; the connector did not confirm that it let that sign-in go, so the connector was ended (check the connection to start it again)`;
const STILL_PENDING = 'a sign-in started here is still pending: finish it in your browser, or cancel it';
const UNOPENED = 'the browser could not be opened for the sign-in page; the sign-in is still pending: cancel it, then sign in again';
const UNOPENED_BEFORE = 'the browser could not be opened; the sign-in is still waiting';
const ENDED_BEFORE_SIGN_IN = 'the connector ended before the sign-in completed';              // the connector's own end was seen
const ENDED_HERE_BEFORE_SIGN_IN = 'the connector was ended here before the sign-in completed';   // RELEASED, where the app ended it
const SHIM_ENDED = 'a connector that was ended here did not end by itself in time; its wsl.exe shim was ended, which does not show that the connector, or the Codex app server it runs, ended in WSL';
const SHIM_NOT_ENDED = 'a connector that was ended here did not end by itself in time; its wsl.exe shim did not end either, so it is not known that the connector, or the Codex app server it runs, ended in WSL';
const BEING_STARTED = 'a sign-in is being started: no question can be sent until that sign-in is over';
const local = (reason) => ({ status: 'refused', code: 'local', reason });
const ASK_PENDING = local('a sign-in is still pending: finish it in your browser, or cancel it in the control window');
const ASK_UNOPENED = local('a sign-in is still pending, though its page could not be opened: cancel it in the control window');
const ASK_NOT_KNOWN = local('the sign-in state of the ChatGPT subscription is not known (check it in the control window)');
const ASK_UNAVAILABLE = local(UNAVAILABLE);
const ASK_BUSY = { status: 'refused', code: 'busy', reason: 'another question is still being answered' };
const UNCERTAIN = { status: 'uncertain', reason: 'no answer came; whether ChatGPT worked on the question is not known' };

// ---- what the stand-in is told to answer -----------------------------------------------------------------------------
const SIGNED_OUT = { auth: { state: 'signed_out', mode: null, plan: null }, rate_limits: null, models: [{ id: 'qa-synthetic-vision', label: 'QA synthetic (no model)', image_input: true, default: true }] };
const SIGNED_OUT_ONCE = { do: 'result', connection: SIGNED_OUT };            // this read only; the reads after it say signed in
const OFFICIAL = 'https://chatgpt.com/qa-synthetic-not-a-sign-in';           // official by its host: the app hands it to the opener (a recorder here)
const OFFICIAL_START = { do: 'result', address: 'official' };
const BUSY = { do: 'error', code: 'busy' };                                  // what the real connector answers a question while a sign-in is pending in it
const SYN = 'SYNTHETIC (QA fake bridge: no model, no ChatGPT).';

// ---- one app and its stand-in connector ------------------------------------------------------------------------------
/** The app's request bounds (ms): LONG while a request may start the stand-in; HELD only for a step scripted to get no answer. */
const LONG = 20_000;
const HELD = 800;
/** How long an absence ("nothing starts by itself") is watched. */
const WATCHED = 2000;
const worlds = [];
const folders = [];   // every temp folder made here: removed at the end
const observed = {};
const running = new AsyncLocalStorage();   // the test a step belongs to: { worlds, over, t }
const temp = () => { const folder = mkdtempSync(join(tmpdir(), 'qa-sub-bridge-')); folders.push(folder); return folder; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (what, ok, ms = 10_000) => {
  for (const by = Date.now() + ms; !ok();) {
    if (running.getStore()?.over) throw new Error(`the test was over while waiting for: ${what}`);
    if (Date.now() > by) throw new Error(`timed out waiting for: ${what}`);
    await sleep(4);
  }
};
const see = (s) => ({ state: s.state, login: s.login, detail: s.detail });
const words = (s) => `${s.login}: ${s.detail}`;
const whole = (s) => `${s.state}, ${s.login}: ${s.detail}`;
const short = (o) => (o.status === 'answered' ? { status: o.status, text: o.answer.text } : o);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/**
 * One test, with a time limit (30 s unless given). Whatever it started is ended when it is over, also when the limit
 * ended it: its stand-ins are killed, no new one is started for it, and its waits throw. So an app that reads or waits
 * without end fails its test, the tests after it run undisturbed, and the run ends.
 */
const limited = (name, fn, ms = 30_000) => test(name, { timeout: ms }, async (t) => {
  const mine = { worlds: [], over: false, t };
  const stop = () => { mine.over = true; for (const w of mine.worlds) w.kill(); };
  t.signal.addEventListener('abort', stop);   // the limit: the test's own awaits never return
  try { await running.run(mine, fn); } finally { stop(); }
});

function world(tree, launches, { open = 'record', ...options } = {}) {
  const folder = temp();
  const mine = running.getStore();
  writeFileSync(join(folder, 'bridge-script.json'), JSON.stringify({ launches }));
  const w = { tree, folder, said: [], opened: [], spawns: [], children: [], got: [], outputs_ended: 0, asked: 0 };
  worlds.push(w);
  mine?.worlds.push(w);
  const o = {
    config: { launch: { kind: 'wsl', distribution: 'qa-offline', user: 'qa-offline', cd: folder, python: BRIDGE }, state_dir: null, codex_bin: null },
    notify: (s) => w.said.push(see(s)),
    openExternal: (url) => { w.opened.push(url); return open === 'reject' ? Promise.reject(new Error('QA: no browser here')) : undefined; },
    spawn: (command, args, so) => {
      if (mine?.over) throw new Error('QA: the test is over, nothing more is started for it');
      w.spawns.push([command, ...args]);   // what the app would run; the stand-in is run in its place
      const child = spawn(PYTHON, args.slice(args.indexOf('--exec') + 1), { cwd: args[args.indexOf('--cd') + 1], stdio: so.stdio, env: { PATH: '/usr/bin:/bin' } });
      w.children.push(child);
      let rest = '';
      child.stdout.on('data', (chunk) => {   // beside the app's own listener: which whole lines it has been handed
        const lines = (rest + chunk.toString('latin1')).split('\n');
        rest = lines.pop();
        for (const line of lines) {
          let m = null;
          try { m = line.length < 65536 ? JSON.parse(line) : null; } catch { /* not a line of the envelope */ }
          w.got.push(m ? { id: m.id ?? null, method: m.method ?? null, error: m.error?.code ?? null, late: /LATE answer/.test(m.result?.text ?? '') } : { not_envelope_bytes: line.length });
        }
      });
      child.stdout.on('end', () => { w.outputs_ended += 1; });
      return child;
    },
    request_ms: LONG, ask_ms: LONG, end_ms: 5000, ...options,
  };
  w.sub = new Module[tree].Subscription(o);
  /** The bound of every request the app makes from now on (it reads its options at each request). */
  w.bounds = (ms) => { Object.assign(o, { request_ms: ms, ask_ms: ms }); };
  w.st = () => see(w.sub.status());
  w.log = () => {   // the stand-in's own log: whole lines only (it may be writing one)
    const text = existsSync(join(folder, 'bridge-log.jsonl')) ? readFileSync(join(folder, 'bridge-log.jsonl'), 'utf8') : '';
    return text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  };
  w.events = (event) => w.log().filter((e) => e.event === event);
  w.requests = (method) => w.log().filter((e) => e.event === 'request' && e.method === method).length;
  w.handed = (method) => w.got.filter((l) => l.method === method).length;
  w.exits = () => w.events('exit').map((e) => ({ on: e.on, code: e.code }));
  w.alive = (n) => w.children[n].exitCode === null && w.children[n].signalCode === null;
  w.kill = () => { for (const [n, child] of w.children.entries()) if (w.alive(n)) child.kill('SIGKILL'); };
  w.request = (session = 'cap-1', question = 'What is this?') => ({ request_id: `ask-qa.${++w.asked}`, question, assistance: 'explain',
    image: { png_base64: PNG.toString('base64'), sha256: createHash('sha256').update(PNG).digest('hex'), width: 1, height: 1 },
    context: { capture_session_id: session, frame_seq: 3, frame_captured_at: '2026-10-01T00:00:00.000Z', frame_width: 1, frame_height: 1, display: { id: 'd', bounds: { x: 0, y: 0, width: 1, height: 1 }, scale_factor: 1 },
      region_dip: { x: 0, y: 0, width: 1, height: 1 }, region_px: { x: 0, y: 0, width: 1, height: 1 }, ink_revision: 2, ink_sha256: null, source_url: null, source_version: null, media_position: null } });
  w.end = () => w.sub.quit();
  return w;
}
/** The same steps on several commits at once (each has its own app and its own stand-in process). */
const on = async (trees, run) => Object.fromEntries(await Promise.all(trees.map(async (tree) => [tree, await run(tree)])));
const both = (run) => on(['released', 'before'], run);
const three = (run) => on(['released', 'first_release', 'before'], run);
/** Several cases at once, each on those commits. */
const table = async (rows, run, commits = both) => Object.fromEntries(await Promise.all(Object.entries(rows).map(async ([name, row]) => [name, await commits((tree) => run(tree, row, name))])));
/** An absence can only be watched for a time: what the app started and said in the next 2 s. */
const watched = async (w) => {
  const from = { starts: w.spawns.length, said: w.said.length };
  await sleep(WATCHED);
  return { connector_starts: w.spawns.length - from.starts, notifications: w.said.length - from.said };
};
const NOTHING = { connector_starts: 0, notifications: 0 };
/** A question the stand-in holds: `interrupt` is called once the stand-in has it. Resolves with how the question ended. */
const heldQuestion = async (w, session, interrupt) => {
  const request = w.request(session, SURFACE_QUESTION);
  const outcome = w.sub.ask(request);
  await until(`${request.request_id} is in the stand-in's log`, () => w.events('ask').some((e) => e.request_id === request.request_id));
  interrupt(request.request_id);
  return short(await outcome);
};

const ev = evidence('sub_changed_bridge', ['sub_changed_bridge.test.mjs', 'sub_tree.mjs', 'qa_fake_bridge.py', 'scenarios.mjs'], COMMITS);
afterEach((t) => ev.seen(t));
after(async () => {
  for (const w of worlds) {
    w.kill();
    await w.sub.quit().catch(() => undefined);
  }
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
  ev.write(observed);
}, { timeout: 30_000 });   // a quit that never comes back fails the file, with no evidence, instead of ending it silently

// ================================================================= QA-SUB-05: a failed account read, a failed sign-in start
const readOnce = async (tree, read) => {
  // A read that gets no answer is the SECOND one: the first is answered under the long bound (it starts the stand-in).
  const hold = read.do === 'hold';
  const w = world(tree, [{ reads: hold ? [{ do: 'result' }, read] : [read] }]);
  if (hold) {
    await w.sub.check();
    assert.equal(w.st().state, 'signed_in', `${tree}: the first read`);
    w.bounds(HELD);
  }
  await w.sub.check();
  if (hold) await until('the held read is in the stand-in\'s log', () => w.requests('connection/read') === 2);
  const seen = { ...w.st(), reads_received: w.requests('connection/read'), connector_starts: w.spawns.length };
  await w.end();
  return seen;
};
const unread = (detail, reads_received = 1) => ({ state: 'unavailable', login: 'none', detail, reads_received, connector_starts: 1 });

limited('QA-SUB-05 account read refused with a code: RELEASED says it in words about the READ (busy; not signed in; every other or unknown code); BEFORE said the words of a refused QUESTION', async () => {
  const rows = {   // code -> [released, before]
    busy: ['the connector is busy, so the account was not read; check again', 'another question is still being answered'],
    unauthenticated: ['the account could not be read: the connector says ChatGPT is not signed in', 'ChatGPT is not signed in (sign in from the control window)'],
    failed: ['the account could not be read', 'ChatGPT did not complete an answer'],
    quota: ['the account could not be read', 'the subscription\'s usage limit was reached'],
    'qa-not-a-code': ['the account could not be read', 'ChatGPT did not complete an answer'],   // a code the app does not know is read as `failed`
  };
  const seen = observed.read_refused = await table(rows, (tree, _texts, code) => readOnce(tree, { do: 'error', code }));
  for (const [code, [released, before]] of Object.entries(rows)) {
    assert.deepEqual(seen[code].released, unread(released), code);
    assert.deepEqual(seen[code].before, unread(before), code);
  }
});

limited('QA-SUB-05 account read, NOT changed between RELEASED and BEFORE: code unavailable, a result of another shape, and no answer within the bound (0.8 s; the second read, after one that was answered) are said the same', async () => {
  const rows = { unavailable: [{ do: 'error', code: 'unavailable' }, unread(UNAVAILABLE)], no_answer: [{ do: 'hold' }, unread(NO_ANSWER, 2)], another_shape: [{ do: 'result', result: { something: 'else' } }, unread(OTHER_FORM)] };
  const seen = observed.read_unchanged = await table(rows, (tree, [read]) => readOnce(tree, read));
  for (const [name, [, expected]] of Object.entries(rows)) {
    assert.deepEqual(seen[name].released, expected, name);
    assert.deepEqual(seen[name].before, seen[name].released, name);
  }
});

const startOnce = async (tree, start) => {
  const w = world(tree, [{ connection: SIGNED_OUT, login_start: [start] }]);
  await w.sub.check();
  if (start.do === 'hold') w.bounds(HELD);   // only the start, which the stand-in holds
  await w.sub.login();
  const seen = { ...w.st(), opened: w.opened, starts_received: w.requests('connection/login/start'), connector_starts: w.spawns.length, stand_in_exits: w.exits() };
  await w.end();
  return seen;
};
const unstarted = (detail, more = {}) => ({ state: 'signed_out', login: 'failed', detail, opened: [], starts_received: 1, connector_starts: 1, stand_in_exits: [], ...more });

limited('QA-SUB-05 sign-in start refused with a code: RELEASED says it in words about the SIGN-IN (busy; every other or unknown code); BEFORE said the words of a refused QUESTION; nothing is opened', async () => {
  const rows = {   // code -> [released, before]
    busy: ['a sign-in or a question is already pending in the connector, so no sign-in was started', 'another question is still being answered'],
    failed: ['the sign-in could not be started', 'ChatGPT did not complete an answer'],
    unauthenticated: ['the sign-in could not be started', 'ChatGPT is not signed in (sign in from the control window)'],
    quota: ['the sign-in could not be started', 'the subscription\'s usage limit was reached'],
    'qa-not-a-code': ['the sign-in could not be started', 'ChatGPT did not complete an answer'],
  };
  const seen = observed.sign_in_start_refused = await table(rows, (tree, _texts, code) => startOnce(tree, { do: 'error', code }));
  for (const [code, [released, before]] of Object.entries(rows)) {
    assert.deepEqual(seen[code].released, unstarted(released), code);
    assert.deepEqual(seen[code].before, unstarted(before), code);
  }
});

limited('QA-SUB-05 sign-in start, NOT changed between RELEASED and BEFORE: code unavailable, a result of another shape, no answer within the bound (0.8 s), and the connector ending during the start are said the same', async () => {
  const rows = {
    unavailable: [{ do: 'error', code: 'unavailable' }, unstarted(UNAVAILABLE)],
    another_shape: [{ do: 'malformed' }, unstarted(OTHER_FORM)],
    no_answer: [{ do: 'hold' }, unstarted(NO_ANSWER)],
    // QA NOTE: the connector ENDED here, and the app first says so ('the connector ended before the sign-in completed'),
    // then overwrites it in the same turn with 'the connector did not answer'. Same on RELEASED and BEFORE; reported.
    connector_exits: [{ do: 'exit', code: 1 }, unstarted(NO_ANSWER, { state: 'unavailable', stand_in_exits: [{ on: 'login_start', code: 1 }] })],
  };
  const seen = observed.sign_in_start_unchanged = await table(rows, (tree, [start]) => startOnce(tree, start));
  for (const [name, [, expected]] of Object.entries(rows)) {
    assert.deepEqual(seen[name].released, expected, name);
    assert.deepEqual(seen[name].before, seen[name].released, name);
  }
});

// ================================================================= QA-SUB-06: the pending sign-in and its cancellation
/** Signed out, Sign in pressed, the stand-in gave an official address: the app waits (the opener recorded the address). */
const waiting = async (tree, launch, options) => {
  const w = world(tree, [{ login_start: [OFFICIAL_START], ...launch }, { connection: SIGNED_OUT }], options);
  await w.sub.check();
  await w.sub.login();
  assert.deepEqual([w.st(), w.opened], [{ state: 'signed_out', login: 'waiting', detail: null }, [OFFICIAL]], `${tree}: not waiting`);
  return w;
};
const out = (login, detail) => ({ state: 'signed_out', login, detail });
const SIGNED_IN = { state: 'signed_in', login: 'none', detail: null };

limited('QA-SUB-06 Cancel sign-in, by what the cancel is answered: RELEASED waits ("being cancelled"), then {} -> cancelled; invalid_request -> failed, "no longer holds"; another error, another shape or no answer -> still waiting, "not confirmed", and a second cancel IS sent. BEFORE said cancelled at once and never read the answer', async () => {
  const again = { said: [`waiting: ${CANCELLING}`, `waiting: ${NOT_CONFIRMED}`], after: out('waiting', NOT_CONFIRMED), second_press: out('cancelled', null), cancels_received: 2 };
  const rows = {   // what the first cancel is answered -> RELEASED
    acknowledged: [{ do: 'result' }, { said: [`waiting: ${CANCELLING}`, 'cancelled: null'], after: out('cancelled', null), second_press: out('cancelled', null), cancels_received: 1 }],
    invalid_request: [{ do: 'error', code: 'invalid_request' }, { said: [`waiting: ${CANCELLING}`, `failed: ${NOT_HELD}`], after: out('failed', NOT_HELD), second_press: out('failed', NOT_HELD), cancels_received: 1 }],
    error_failed: [{ do: 'error', code: 'failed' }, again],
    error_busy: [{ do: 'error', code: 'busy' }, again],
    another_shape: [{ do: 'result', result: { cancelled: true } }, again],
    no_answer: [{ do: 'hold' }, again],
  };
  const seen = observed.cancel_answered = await table(rows, async (tree, [first]) => {
    const w = await waiting(tree, { connection: SIGNED_OUT, login_cancel: [first, { do: 'result' }] });
    const from = w.said.length;
    if (first.do === 'hold') w.bounds(HELD);   // only the cancel that the stand-in holds
    await w.sub.cancelLogin();
    w.bounds(LONG);
    const one = { said: w.said.slice(from).map(words), after: w.st() };
    await w.sub.cancelLogin();   // pressed again, after the first was answered or given up
    const two = w.st();
    await w.sub.check();         // a read after them: every cancel the app wrote is in the stand-in's log before it
    const r = { ...one, second_press: two, cancels_received: w.requests('connection/login/cancel') };
    await w.end();
    return r;
  });
  for (const [name, [, released]] of Object.entries(rows)) {
    assert.deepEqual(seen[name].released, released, name);
    assert.deepEqual(seen[name].before, { said: ['cancelled: null'], after: out('cancelled', null), second_press: out('cancelled', null), cancels_received: 1 }, name);
  }
});

limited('QA-SUB-06 while the cancel is out: RELEASED still says waiting with "the sign-in is being cancelled", and a second press sends nothing and says nothing; BEFORE already said cancelled', async () => {
  const seen = observed.cancel_out = await both(async (tree) => {
    const w = await waiting(tree, { connection: SIGNED_OUT, login_cancel: [{ do: 'hold' }] });
    w.bounds(HELD);   // only the cancel, which the stand-in holds
    const first = w.sub.cancelLogin();
    w.bounds(LONG);
    await until('the cancel is in the stand-in\'s log', () => w.requests('connection/login/cancel') === 1);
    const while_out = w.st();
    const from = w.said.length;
    await w.sub.cancelLogin();   // pressed again while the first is still out
    const second_press = { said: w.said.slice(from).length, now: w.st() };
    await first;
    const given_up = w.st();
    await w.sub.check();
    const r = { while_out, second_press, given_up, cancels_received: w.requests('connection/login/cancel') };
    await w.end();
    return r;
  });
  assert.deepEqual(seen.released, { while_out: out('waiting', CANCELLING), second_press: { said: 0, now: out('waiting', CANCELLING) }, given_up: out('waiting', NOT_CONFIRMED), cancels_received: 1 });
  assert.deepEqual(seen.before, { while_out: out('cancelled', null), second_press: { said: 0, now: out('cancelled', null) }, given_up: out('cancelled', null), cancels_received: 1 });
});

limited('QA-SUB-06 the sign-in completes (success) while its cancel is out, and the cancel gets no answer: RELEASED takes the completion (no sign-in pending, the account is read again: signed in); BEFORE ignored it and stayed cancelled and signed out', async () => {
  const seen = observed.cancel_out_sign_in_completes = await both(async (tree) => {
    const w = await waiting(tree, { reads: [SIGNED_OUT_ONCE], login_cancel: [{ do: 'hold', completed: { success: true, error: null } }] });
    w.bounds(HELD);   // only the cancel, which the stand-in holds
    const first = w.sub.cancelLogin();
    w.bounds(LONG);
    await until('the completion was handed to the app', () => w.handed('connection/login/completed') === 1);
    await until('no read is out', () => w.st().state !== 'checking');
    const r = { after_completion: w.st() };
    await first;
    r.after_the_cancel_was_given_up = w.st();
    await w.sub.check();   // the test's own read, last in the stand-in's log: the reads before it are the app's
    r.reads_before_the_tests_own = w.requests('connection/read') - 1;
    await w.end();
    return r;
  });
  assert.deepEqual(seen.released, { after_completion: SIGNED_IN, after_the_cancel_was_given_up: SIGNED_IN, reads_before_the_tests_own: 2 });
  assert.deepEqual(seen.before, { after_completion: out('cancelled', null), after_the_cancel_was_given_up: out('cancelled', null), reads_before_the_tests_own: 1 });
});

limited('QA-SUB-06 the sign-in completes (success) while its cancel is out, and the cancel is THEN acknowledged {} (0.5 s later): RELEASED stays signed in with no sign-in said (the late acknowledgement does not turn it into "cancelled"); BEFORE said cancelled and signed out, and did not read the account', async () => {
  const seen = observed.cancel_out_sign_in_completes_then_acknowledged = await both(async (tree) => {
    const w = await waiting(tree, { reads: [SIGNED_OUT_ONCE], login_cancel: [{ do: 'result', delay_ms: 500, completed: { success: true, error: null } }] });
    const first = w.sub.cancelLogin();
    await until('the completion was handed to the app', () => w.handed('connection/login/completed') === 1);
    await until('no read is out', () => w.st().state !== 'checking');
    const r = { after_completion: w.st() };
    await first;
    r.after_the_cancel_was_acknowledged = w.st();
    // What the stand-in wrote from the cancel on, by its own log and in its order: the completion, (RELEASED: the answer
    // of the read the app made for it,) and only then the cancel's acknowledgement. (It logs a line after writing it.)
    const wrote = () => {
      const log = w.log();
      const kinds = log.slice(log.findIndex((e) => e.event === 'request' && e.method === 'connection/login/cancel')).filter((e) => e.event === 'sent').map((e) => e.kind);
      return kinds.slice(0, kinds.indexOf('login_cancel_receipt') + 1);
    };
    await until('the acknowledgement is in the stand-in\'s log', () => wrote().length > 0);
    r.stand_in_wrote = wrote();
    await w.sub.check();
    Object.assign(r, { after_a_check: w.st(), cancels_received: w.requests('connection/login/cancel') });
    await w.end();
    return r;
  });
  assert.deepEqual(seen.released, { after_completion: SIGNED_IN, after_the_cancel_was_acknowledged: SIGNED_IN, stand_in_wrote: ['login_completed', 'connection', 'login_cancel_receipt'], after_a_check: SIGNED_IN, cancels_received: 1 });
  assert.deepEqual(seen.before, { after_completion: out('cancelled', null), after_the_cancel_was_acknowledged: out('cancelled', null), stand_in_wrote: ['login_completed', 'login_cancel_receipt'], after_a_check: SIGNED_IN, cancels_received: 1 });
});

limited('QA-SUB-06 a signed-in read while a sign-in is pending: RELEASED keeps the pending sign-in and refuses a question HERE (0 asks reach the connector), also while its cancel is out and after it was not confirmed; BEFORE forgot the sign-in and sent every question', async () => {
  const seen = observed.signed_in_while_pending = await both(async (tree) => {
    const w = await waiting(tree, { reads: [SIGNED_OUT_ONCE], asks: [BUSY, BUSY, BUSY], login_cancel: [{ do: 'hold' }] });
    await w.sub.check();   // the account now reads signed in
    const r = { after_signed_in_read: w.st(), not_askable: w.sub.notAskable('cap-1'), ask: await w.sub.ask(w.request()) };
    w.bounds(HELD);   // only the cancel, which the stand-in holds
    const cancel = w.sub.cancelLogin();
    w.bounds(LONG);
    Object.assign(r, { cancel_out: w.st(), ask_while_cancel_out: await w.sub.ask(w.request()) });
    await cancel;
    Object.assign(r, { cancel_given_up: w.st(), ask_after: await w.sub.ask(w.request()) });
    await w.sub.check();
    Object.assign(r, { asks_received: w.events('ask').length, cancels_received: w.requests('connection/login/cancel') });
    await w.end();
    return r;
  });
  const pending = (detail) => ({ state: 'signed_in', login: 'waiting', detail });
  assert.deepEqual(seen.released, { after_signed_in_read: pending(STILL_PENDING), not_askable: ASK_PENDING.reason, ask: ASK_PENDING, cancel_out: pending(CANCELLING), ask_while_cancel_out: ASK_PENDING,
    cancel_given_up: pending(NOT_CONFIRMED), ask_after: ASK_PENDING, asks_received: 0, cancels_received: 1 });
  assert.deepEqual(seen.before, { after_signed_in_read: SIGNED_IN, not_askable: null, ask: ASK_BUSY, cancel_out: SIGNED_IN, ask_while_cancel_out: ASK_BUSY, cancel_given_up: SIGNED_IN, ask_after: ASK_BUSY, asks_received: 3, cancels_received: 0 });
});

limited('QA-SUB-06 a question while a sign-in is being STARTED (signed in, the start not yet answered): RELEASED refuses it HERE, "a sign-in is being started", 0 asks received; BEFORE sent it', async () => {
  const seen = observed.question_while_sign_in_starts = await both(async (tree) => {
    const w = world(tree, [{ asks: [BUSY], login_start: [{ do: 'hold' }] }]);
    await w.sub.check();
    w.bounds(HELD);   // only the start, which the stand-in holds
    const start = w.sub.login();
    w.bounds(LONG);
    const r = { starting: w.st(), not_askable: w.sub.notAskable('cap-1'), ask: await w.sub.ask(w.request()) };
    await start;
    r.start_given_up = w.st();
    await w.sub.check();
    Object.assign(r, { asks_received: w.events('ask').length, starts_received: w.requests('connection/login/start') });
    await w.end();
    return r;
  });
  const same = { starting: { state: 'signed_in', login: 'starting', detail: null }, start_given_up: { state: 'signed_in', login: 'failed', detail: NO_ANSWER }, starts_received: 1 };
  assert.deepEqual(seen.released, { ...same, not_askable: BEING_STARTED, ask: local(BEING_STARTED), asks_received: 0 });
  assert.deepEqual(seen.before, { ...same, not_askable: null, ask: ASK_BUSY, asks_received: 1 });
});

limited('QA-SUB-06 a signed-in READ while a sign-in is being started (the start still unanswered): RELEASED still says "starting" after the read and refuses a question HERE, 0 asks received; BEFORE forgot the sign-in at the read and sent the question', async () => {
  const seen = observed.signed_in_read_while_sign_in_starts = await both(async (tree) => {
    // The start is held under the LONG bound and never given up here: it is unanswered for as long as the steps take.
    const w = world(tree, [{ asks: [BUSY], login_start: [{ do: 'hold' }] }]);
    await w.sub.check();
    void w.sub.login();
    await until('the start is in the stand-in\'s log', () => w.requests('connection/login/start') === 1);
    const r = { starting: w.st() };
    const from = w.said.length;
    await w.sub.check();   // a read, answered signed in, while the start is out
    Object.assign(r, { said_by_the_read: w.said.slice(from).map(whole), after_the_read: w.st(), not_askable: w.sub.notAskable('cap-1'), ask: await w.sub.ask(w.request()) });
    await w.sub.check();
    // (the app's requests are r1, r2, ...: r1 the first read, r2 the start)
    Object.assign(r, { asks_received: w.events('ask').length, starts_received: w.requests('connection/login/start'), start_answered_by_then: w.got.some((l) => l.id === 'r2') });
    await w.end();
    return r;
  });
  const starting = { state: 'signed_in', login: 'starting', detail: null };
  assert.deepEqual(seen.released, { starting, said_by_the_read: ['checking, starting: null', 'signed_in, starting: null'], after_the_read: starting, not_askable: BEING_STARTED, ask: local(BEING_STARTED),
    asks_received: 0, starts_received: 1, start_answered_by_then: false });
  assert.deepEqual(seen.before, { starting, said_by_the_read: ['checking, starting: null', 'signed_in, none: null'], after_the_read: SIGNED_IN, not_askable: null, ask: ASK_BUSY,
    asks_received: 1, starts_received: 1, start_answered_by_then: false });
});

const refused = async (tree, cancel) => {
  const w = world(tree, [{ connection: SIGNED_OUT, login_start: [{ do: 'result' }], login_cancel: [cancel] }, { connection: SIGNED_OUT }]);
  await w.sub.check();
  const from = w.said.length;
  if (cancel.do === 'hold') w.bounds(HELD);   // the cancel the app sends inside this step is held (its start is answered by the stand-in that answered the read)
  await w.sub.login();
  w.bounds(LONG);
  const r = { said: w.said.slice(from).map(whole), after: w.st(), opened: w.opened, connector_starts_before_check: w.spawns.length };
  await w.sub.check();
  Object.assign(r, { after_check: w.st(), connector_starts: w.spawns.length, cancels_received: w.requests('connection/login/cancel') });
  await w.end();
  return r;
};
const NOT_OPENED_KEPT = { said: ['signed_out, starting: null', `signed_out, refused_address: ${NOT_OPENED}`], after: out('refused_address', NOT_OPENED), opened: [], connector_starts_before_check: 1,
  after_check: out('refused_address', null), connector_starts: 1, cancels_received: 1 };

limited('QA-SUB-06 an address that is not official, its cancel acknowledged ({} or invalid_request): NOT changed between RELEASED and BEFORE: nothing opened, "not an official ChatGPT address", the same connector kept', async () => {
  const rows = { acknowledged: { do: 'result' }, invalid_request: { do: 'error', code: 'invalid_request' } };
  const seen = observed.refused_address_acknowledged = await table(rows, refused);
  for (const name of Object.keys(rows)) {
    assert.deepEqual(seen[name].released, NOT_OPENED_KEPT, name);
    assert.deepEqual(seen[name].before, seen[name].released, name);
  }
});

limited('QA-SUB-06 an address that is not official, its cancel NOT acknowledged (another error, another shape, no answer), on THREE commits: RELEASED ends the connector and says "that connector is no longer used and is being ended", after "the connector was ended here before the sign-in completed"; FIRST_RELEASE ended it too but said "the connector was ended" after "the connector ended before the sign-in completed"; BEFORE kept the connector and said only "not opened". The user\'s Check starts a new one on the two releases', async () => {
  const rows = { error_failed: { do: 'error', code: 'failed' }, another_shape: { do: 'result', result: { cancelled: true } }, no_answer: { do: 'hold' } };
  const seen = observed.refused_address_unacknowledged = await table(rows, refused, three);
  // QA NOTE: between "starting" and the final words the app tells its windows once more, in the same turn: not available,
  // the sign-in FAILED. Nothing completed or failed there: the app itself ended the connector. RELEASED no longer claims
  // the connector's own end in that line ("was ended here"), but still says "failed" for one notification; a harness
  // that logs every status the window is sent will see that line. Reported.
  const ended = (between, final) => ({ said: ['signed_out, starting: null', `unavailable, failed: ${between}`, `unavailable, refused_address: ${final}`], after: { state: 'unavailable', login: 'refused_address', detail: final }, opened: [],
    connector_starts_before_check: 1, after_check: out('refused_address', null), connector_starts: 2, cancels_received: 1 });
  for (const name of Object.keys(rows)) {
    assert.deepEqual(seen[name].released, ended(ENDED_HERE_BEFORE_SIGN_IN, ENDED_FOR_IT), name);
    assert.deepEqual(seen[name].first_release, ended(ENDED_BEFORE_SIGN_IN, ENDED_FOR_IT_FIRST_RELEASE), name);
    assert.deepEqual(seen[name].before, NOT_OPENED_KEPT, name);
  }
});

limited('QA-SUB-06 an address that is not official, and the connector ENDS on the cancel the app sends for it: RELEASED says not available, the sign-in failed, "the connector ended before the sign-in completed", and never says that the address was refused; BEFORE said "not an official ChatGPT address". Nothing is opened; the user\'s Check starts a new connector', async () => {
  // QA NOTE: on RELEASED the one fact the user needs here (the connector gave an address this app refuses to open) is
  // never said: the status shows a sign-in that "failed" because the connector ended. BEFORE said it. Reported.
  const seen = observed.refused_address_connector_ends_on_the_cancel = await both(async (tree) => {
    const w = world(tree, [{ connection: SIGNED_OUT, login_start: [{ do: 'result' }], login_cancel: [{ do: 'exit', code: 1 }] }, { connection: SIGNED_OUT }]);
    await w.sub.check();
    const from = w.said.length;
    await w.sub.login();
    await until('the app says not available', () => w.st().state === 'unavailable');
    const r = { said: w.said.slice(from).map(whole), after: w.st(), opened: w.opened, stand_in_exits: w.exits(), connector_starts_before_check: w.spawns.length };
    await w.sub.check();
    Object.assign(r, { after_check: w.st(), connector_starts: w.spawns.length });
    await w.end();
    return r;
  });
  const same = { opened: [], stand_in_exits: [{ on: 'login_cancel', code: 1 }], connector_starts_before_check: 1, connector_starts: 2 };
  assert.deepEqual(seen.released, { said: ['signed_out, starting: null', `unavailable, failed: ${ENDED_BEFORE_SIGN_IN}`], after: { state: 'unavailable', login: 'failed', detail: ENDED_BEFORE_SIGN_IN }, after_check: out('failed', null), ...same });
  assert.deepEqual(seen.before, { said: ['signed_out, starting: null', `signed_out, refused_address: ${NOT_OPENED}`, `unavailable, refused_address: ${NOT_OPENED}`], after: { state: 'unavailable', login: 'refused_address', detail: NOT_OPENED },
    after_check: out('refused_address', null), ...same });
});

limited('QA-SUB-06 the app itself ends the connector while a sign-in waits (the app\'s quit), on THREE commits: RELEASED says "the connector was ended here before the sign-in completed"; FIRST_RELEASE and BEFORE said "the connector ended before the sign-in completed"', async () => {
  const seen = observed.app_ends_the_connector_while_sign_in_waits = await three(async (tree) => {
    const w = await waiting(tree, { connection: SIGNED_OUT });
    const from = w.said.length;
    await w.sub.quit();
    await until('the stand-in logged the end of its input', () => w.events('eof').length === 1);
    return { said: w.said.slice(from).map(whole), now: w.st(), connector_starts: w.spawns.length };
  });
  const ended = (detail) => ({ said: [`unavailable, failed: ${detail}`], now: { state: 'unavailable', login: 'failed', detail }, connector_starts: 1 });
  assert.deepEqual(seen.released, ended(ENDED_HERE_BEFORE_SIGN_IN));
  assert.deepEqual(seen.first_release, ended(ENDED_BEFORE_SIGN_IN));
  assert.deepEqual(seen.before, seen.first_release);
});

limited('QA-SUB-06 the browser cannot be opened: RELEASED says the sign-in is still pending and to cancel it, keeps saying so after a signed-in read, and refuses a question HERE; BEFORE said "still waiting", then forgot the sign-in and sent the question', async () => {
  const seen = observed.browser_not_opened = await both(async (tree) => {
    const w = world(tree, [{ reads: [SIGNED_OUT_ONCE], asks: [BUSY], login_start: [OFFICIAL_START], login_cancel: [{ do: 'result' }] }], { open: 'reject' });
    await w.sub.check();
    await w.sub.login();
    const r = { not_opened: w.st(), handed_to_the_opener: w.opened };
    await w.sub.check();
    Object.assign(r, { after_signed_in_read: w.st(), ask: await w.sub.ask(w.request()) });
    await w.sub.cancelLogin();
    r.after_cancel = w.st();
    await w.sub.check();
    Object.assign(r, { asks_received: w.events('ask').length, cancels_received: w.requests('connection/login/cancel') });
    await w.end();
    return r;
  });
  assert.deepEqual(seen.released, { not_opened: out('waiting', UNOPENED), handed_to_the_opener: [OFFICIAL], after_signed_in_read: { state: 'signed_in', login: 'waiting', detail: UNOPENED }, ask: ASK_UNOPENED,
    after_cancel: { state: 'signed_in', login: 'cancelled', detail: null }, asks_received: 0, cancels_received: 1 });
  assert.deepEqual(seen.before, { not_opened: out('waiting', UNOPENED_BEFORE), handed_to_the_opener: [OFFICIAL], after_signed_in_read: SIGNED_IN, ask: ASK_BUSY, after_cancel: SIGNED_IN, asks_received: 1, cancels_received: 0 });
});

limited('QA-SUB-06 the browser cannot be opened AND the cancel is then not confirmed: RELEASED says the cancel\'s note ("not confirmed ... cancel it again"), not the browser\'s, while a question is still refused with the browser\'s words; a second cancel, acknowledged, ends it. BEFORE said cancelled at once, then forgot the sign-in and sent the question', async () => {
  const seen = observed.browser_not_opened_and_cancel_not_confirmed = await both(async (tree) => {
    const w = world(tree, [{ reads: [SIGNED_OUT_ONCE], asks: [BUSY], login_start: [OFFICIAL_START], login_cancel: [{ do: 'error', code: 'failed' }, { do: 'result' }] }], { open: 'reject' });
    await w.sub.check();
    await w.sub.login();
    const r = { not_opened: w.st() };
    const from = w.said.length;
    await w.sub.cancelLogin();
    Object.assign(r, { said_by_the_cancel: w.said.slice(from).map(words), cancel_not_confirmed: w.st() });
    await w.sub.check();   // the account now reads signed in
    Object.assign(r, { after_signed_in_read: w.st(), ask: await w.sub.ask(w.request()) });
    await w.sub.cancelLogin();
    r.second_press = w.st();
    await w.sub.check();
    Object.assign(r, { asks_received: w.events('ask').length, cancels_received: w.requests('connection/login/cancel') });
    await w.end();
    return r;
  });
  assert.deepEqual(seen.released, { not_opened: out('waiting', UNOPENED), said_by_the_cancel: [`waiting: ${CANCELLING}`, `waiting: ${NOT_CONFIRMED}`], cancel_not_confirmed: out('waiting', NOT_CONFIRMED),
    after_signed_in_read: { state: 'signed_in', login: 'waiting', detail: NOT_CONFIRMED }, ask: ASK_UNOPENED, second_press: { state: 'signed_in', login: 'cancelled', detail: null }, asks_received: 0, cancels_received: 2 });
  assert.deepEqual(seen.before, { not_opened: out('waiting', UNOPENED_BEFORE), said_by_the_cancel: ['cancelled: null'], cancel_not_confirmed: out('cancelled', null),
    after_signed_in_read: SIGNED_IN, ask: ASK_BUSY, second_press: SIGNED_IN, asks_received: 1, cancels_received: 1 });
});

// ================================================================= QA-SUB-07: reads caused by "the account changed"
const READ = ['checking', 'signed_in'];
const NOT_KNOWN = { state: 'unknown', login: 'none', detail: NOT_READ_AGAIN };

// "Shortly after" is 60 ms here (10 ms in the 64-reads case): long enough that the app has taken the read's answer
// before the next "changed" comes, so the order of what it says is very unlikely to depend on how busy this machine is
// (the cases assert that exact order; it held in every run, also with four copies on one core).
limited('QA-SUB-07 "changed" shortly after EVERY read answer: RELEASED reads 3 more times (4 in all) and then says not known with the note, a question is refused HERE, and a second Check again costs 4 reads; BEFORE reads without end (watched to 20 reads for one Check, never "not known")', async () => {
  const seen = observed.changed_after_every_read = await both(async (tree) => {
    const w = world(tree, [{ changed: { when: 'after_read', delay_ms: 60 } }]);
    await w.sub.check();
    if (tree === 'before') {   // it does not stop by itself: watched until 20 reads were made for the one Check, then ended
      await until('20 reads for one Check', () => w.requests('connection/read') >= 20);
      const r = { reads_for_one_check_at_least: 20, said_not_known: w.said.some((s) => s.state === 'unknown'), connector_starts: w.spawns.length };
      await w.end();
      return r;
    }
    await until('the state is said as not known', () => w.st().state === 'unknown');
    const r = { after_one_check: w.st(), states_said: w.said.map((s) => s.state), changed_handed: w.handed('connection/changed'), ask: await w.sub.ask(w.request()) };
    r.reads_for_one_check = w.requests('connection/read');
    await w.sub.check();
    await until('not known again', () => w.st().state === 'unknown');
    Object.assign(r, { after_a_second_check: w.st(), reads_for_two_checks: w.requests('connection/read'), asks_received: w.events('ask').length, connector_starts: w.spawns.length });
    await w.end();
    return r;
  });
  assert.deepEqual(seen.released, { after_one_check: NOT_KNOWN, states_said: [...READ, ...READ, ...READ, ...READ, 'unknown'], changed_handed: 4, ask: ASK_NOT_KNOWN, reads_for_one_check: 4,
    after_a_second_check: NOT_KNOWN, reads_for_two_checks: 8, asks_received: 0, connector_starts: 1 });
  assert.deepEqual(seen.before, { reads_for_one_check_at_least: 20, said_not_known: false, connector_starts: 1 });
});

limited('QA-SUB-07 "changed" in the same write as EVERY read answer: one Check makes 4 reads on RELEASED and BEFORE and ends as not known; RELEASED says the new note, BEFORE said "changed again while it was being read"', async () => {
  const seen = observed.changed_with_every_read = await both(async (tree) => {
    const w = world(tree, [{ changed: { when: 'with_read' } }]);
    await w.sub.check();
    const r = { after_one_check: w.st(), states_said: w.said.map((s) => s.state), reads_for_one_check: w.requests('connection/read'), changed_handed: w.handed('connection/changed'), ask: await w.sub.ask(w.request()) };
    await w.sub.check();
    Object.assign(r, { reads_for_two_checks: w.requests('connection/read'), asks_received: w.events('ask').length, connector_starts: w.spawns.length });
    await w.end();
    return r;
  });
  const same = { states_said: ['checking', 'unknown'], reads_for_one_check: 4, changed_handed: 4, ask: ASK_NOT_KNOWN, reads_for_two_checks: 8, asks_received: 0, connector_starts: 1 };
  assert.deepEqual(seen.released, { after_one_check: NOT_KNOWN, ...same });
  assert.deepEqual(seen.before, { after_one_check: { state: 'unknown', login: 'none', detail: NOT_READ_AGAIN_BEFORE }, ...same });
});

limited('QA-SUB-07 reads made INSIDE one Check (a "changed" in the same write as the first 2 answers) count toward the same 3 as the reads after it ("changed" shortly after every later answer): RELEASED makes 4 reads in all (2 inside, 1 after), then says not known; BEFORE reads without end (watched to 12 reads, never "not known")', async () => {
  const seen = observed.changed_inside_and_after_one_check = await both(async (tree) => {
    const w = world(tree, [{ changed: [{ when: 'with_read', times: 2 }, { when: 'after_read', from_read: 2, delay_ms: 60 }] }]);
    await w.sub.check();
    const r = { after_the_check: w.st(), reads_inside_the_check: w.requests('connection/read') };   // (the "changed" after its last answer comes 60 ms later)
    if (tree === 'before') {
      await until('12 reads for one Check', () => w.requests('connection/read') >= 12);
      Object.assign(r, { reads_for_one_check_at_least: 12, said_not_known: w.said.some((s) => s.state === 'unknown') });
    } else {
      await until('the state is said as not known', () => w.st().state === 'unknown');
      Object.assign(r, { then: w.st(), states_said: w.said.map((s) => s.state), reads_for_one_check: w.requests('connection/read'), changed_handed: w.handed('connection/changed') });
    }
    r.connector_starts = w.spawns.length;
    await w.end();
    return r;
  });
  assert.deepEqual(seen.released, { after_the_check: SIGNED_IN, reads_inside_the_check: 3, then: NOT_KNOWN, states_said: [...READ, ...READ, 'unknown'], reads_for_one_check: 4, changed_handed: 4, connector_starts: 1 });
  assert.deepEqual(seen.before, { after_the_check: SIGNED_IN, reads_inside_the_check: 3, reads_for_one_check_at_least: 12, said_not_known: false, connector_starts: 1 });
});

limited('QA-SUB-07 after the bound: 20 more "changed" cause 0 reads and 0 notifications on RELEASED, a question is refused HERE with 0 asks received, and the user\'s Check recovers (1 read, signed in, the same connector); BEFORE read again for them', async () => {
  // QA NOTE: the 4th "changed" within the app's 10 s turns an account that was just read as signed in into "not known"
  // WITHOUT reading it, and every question is refused until the user presses Check. That is the bound as written; how
  // many "changed" the real connector writes for one real change of the account is not known to QA. Reported.
  const seen = observed.changed_after_the_bound = await both(async (tree) => {
    // "changed" 60 ms after each of the first 4 read answers; then, 160 ms after the 4th answer, 20 more, 3 ms apart
    const w = world(tree, [{ changed: [{ when: 'after_read', delay_ms: 60, times: 4 }, { when: 'timer', start_after_reads: 4, delay_ms: 160, every_ms: 3, times: 20 }] }]);
    await w.sub.check();
    await until('four "changed" were handed to the app and no read is out', () => w.handed('connection/changed') >= 4 && w.st().state !== 'checking');
    const fourth = { now: w.st(), said: w.said.length, reads: w.requests('connection/read') };
    await until('all 24 "changed" were handed to the app and no read is out', () => w.handed('connection/changed') === 24 && w.st().state !== 'checking');
    const said = w.said.length;
    const ask = await w.sub.ask(w.request());
    const from = w.said.length;
    await w.sub.check();   // the user's own Check; also the last read in the stand-in's log
    const reads = w.requests('connection/read') - 1;   // before the user's own
    // BEFORE: the user's read and one for each of the first 4 "changed" are 5 reads and 10 notifications; what is above
    // that is for the 20 more (how many of them depends on timing, so only "more" is kept).
    const r = tree === 'before' ? { for_20_more_changed: { read_again: reads > 5, notified_again: said > 10 } }
      : { after_the_fourth: fourth.now, reads_then: fourth.reads, for_20_more_changed: { notifications: said - fourth.said, ask, reads: reads - fourth.reads },
        the_users_check: { said: w.said.slice(from).map((s) => s.state), now: w.st(), reads: 1 }, asks_received: w.events('ask').length };
    r.connector_starts = w.spawns.length;
    await w.end();
    return r;
  });
  assert.deepEqual(seen.released, { after_the_fourth: NOT_KNOWN, reads_then: 4, for_20_more_changed: { notifications: 0, ask: ASK_NOT_KNOWN, reads: 0 },
    the_users_check: { said: READ, now: SIGNED_IN, reads: 1 }, asks_received: 0, connector_starts: 1 });
  assert.deepEqual(seen.before, { for_20_more_changed: { read_again: true, notified_again: true }, connector_starts: 1 });
});

limited('QA-SUB-07 below the bound, NOT changed between RELEASED and BEFORE: 3 "changed" within the window are each read (4 reads with the user\'s), the state stays signed in and a question is sent and answered', async () => {
  const text = `${SYN} Answer below the bound.`;
  const seen = observed.changed_three_times = await both(async (tree) => {
    const w = world(tree, [{ asks: [{ do: 'answer', text }], changed: { when: 'after_read', delay_ms: 60, times: 3 } }]);
    await w.sub.check();
    await until('all 3 "changed" were handed to the app and no read is out', () => w.handed('connection/changed') === 3 && w.st().state !== 'checking');
    const r = { after_3_changed: w.st(), states_said: w.said.map((s) => s.state), ask: short(await w.sub.ask(w.request())) };
    await w.sub.check();
    Object.assign(r, { reads_before_the_users_second_check: w.requests('connection/read') - 1, connector_starts: w.spawns.length });
    await w.end();
    return r;
  });
  assert.deepEqual(seen.released, { after_3_changed: SIGNED_IN, states_said: [...READ, ...READ, ...READ, ...READ], ask: { status: 'answered', text }, reads_before_the_users_second_check: 4, connector_starts: 1 });
  assert.deepEqual(seen.before, seen.released);
});

limited('QA-SUB-07 the bound in all, and the user\'s Check resets it: with a window of 1 ms and one "changed" 10 ms after each of the first 66 read answers, RELEASED reads for 64 of the first 65 changes (65 reads), says not known, and after the user\'s Check (read 66) reads again for the 66th change (read 67: signed in). BEFORE read for all 66 (68 reads with the user\'s two) and never said not known', async () => {
  const seen = observed.changed_64_in_all = await both(async (tree) => {
    const w = world(tree, [{ changed: { when: 'after_read', delay_ms: 10, times: 66 } }], { change_window_ms: 1 });   // BEFORE has no such option: it is ignored there
    await w.sub.check();
    await until('65 "changed" were handed to the app and no read is out', () => w.handed('connection/changed') >= 65 && w.st().state !== 'checking');
    // (RELEASED stays here: no read, so no 66th "changed". BEFORE goes on reading; its state between two reads is kept.)
    const r = { after_65_changed: w.st(), said_not_known_by_then: w.said.filter((s) => s.state === 'unknown').length };
    if (tree !== 'before') r.reads_before_the_users_second_check = w.requests('connection/read');   // (BEFORE is still reading: no fixed number)
    await w.sub.check();   // the user's own Check: on RELEASED read 66, and the 66th "changed" follows its answer
    await until('all 66 "changed" were handed to the app and no read is out', () => w.handed('connection/changed') === 66 && w.st().state !== 'checking');
    Object.assign(r, { after_the_users_check_and_the_66th_changed: w.st(), said_not_known: w.said.filter((s) => s.state === 'unknown').length, reads_in_all: w.requests('connection/read'), connector_starts: w.spawns.length });
    await w.end();
    return r;
  });
  assert.deepEqual(seen.released, { after_65_changed: NOT_KNOWN, said_not_known_by_then: 1, reads_before_the_users_second_check: 65, after_the_users_check_and_the_66th_changed: SIGNED_IN, said_not_known: 1, reads_in_all: 67, connector_starts: 1 });
  assert.deepEqual(seen.before, { after_65_changed: SIGNED_IN, said_not_known_by_then: 0, after_the_users_check_and_the_66th_changed: SIGNED_IN, said_not_known: 0, reads_in_all: 68, connector_starts: 1 });
});

// ================================================================= a question the connector says was cancelled
limited('a question answered "cancelled" that the app did NOT cancel (it sent no cancel and no Stop), on THREE commits: RELEASED says cancelled with uncertain TRUE; FIRST_RELEASE and BEFORE said uncertain false. The app\'s OWN Cancel (confirmed) and OWN Stop (acknowledged) are uncertain false on all three; an unconfirmed Cancel and the code interrupt_unconfirmed are uncertain true on all three', async () => {
  const rows = {   // what the stand-in does with the question, what the user presses while it is held -> the outcome on [released, first_release, before]
    not_asked_for: [{ do: 'error', code: 'cancelled' }, null, [true, false, false], { 'ask/cancel': 0, 'session/stop': 0 }],
    not_asked_for_interrupt_unconfirmed: [{ do: 'error', code: 'interrupt_unconfirmed' }, null, [true, true, true], { 'ask/cancel': 0, 'session/stop': 0 }],
    own_cancel_confirmed: [{ do: 'hold', on_cancel: 'cancelled' }, 'cancel', [false, false, false], { 'ask/cancel': 1, 'session/stop': 0 }],
    own_cancel_not_confirmed: [{ do: 'hold', on_cancel: 'unconfirmed' }, 'cancel', [true, true, true], { 'ask/cancel': 1, 'session/stop': 0 }],
    own_stop_acknowledged: [{ do: 'hold', on_stop: 'cancelled' }, 'stop', [false, false, false], { 'ask/cancel': 0, 'session/stop': 1 }],
  };
  const seen = observed.question_cancelled = await table(rows, async (tree, [ask, press]) => {
    const w = world(tree, [{ asks: [ask] }]);
    await w.sub.check();
    const outcome = press === null ? await w.sub.ask(w.request()) : await heldQuestion(w, 'cap-1', (id) => (press === 'cancel' ? w.sub.cancel(id) : w.sub.stopSession('cap-1')));
    const r = { outcome, after: w.st() };
    await w.sub.check();   // a read after it: whatever the app wrote before is in the stand-in's log
    r.sent_by_the_app = Object.fromEntries(['ask/cancel', 'session/stop'].map((m) => [m, w.requests(m)]));
    r.questions_received = w.events('ask').length;
    await w.end();
    return r;
  }, three);
  for (const [name, [, , uncertain, sent]] of Object.entries(rows)) {
    for (const [i, tree] of ['released', 'first_release', 'before'].entries()) {
      assert.deepEqual(seen[name][tree], { outcome: { status: 'cancelled', uncertain: uncertain[i] }, after: SIGNED_IN, sent_by_the_app: sent, questions_received: 1 }, `${name} on ${tree}`);
    }
  }
});

// ================================================================= what can only be watched for a time
// These cases wait (2 s, 3 s, 7 s) for something NOT to happen, or for a bound to run out. They run side by side, each
// with its own apps and stand-in processes, so that together they cost about the longest of them.
// The Backend change makes the real connector end itself when its Codex child is lost. What the APP then does did not
// change between RELEASED and BEFORE: each "ends by itself" case asserts the released behaviour and that BEFORE did the same.
const SYNTHETIC_AFTER_CHECK = `${SYN} Answer from the connector the user's Check started.`;

describe('side by side', { concurrency: true }, () => {
  limited('the connector ends by itself while idle (exit code 0), app side NOT changed: said once as not available; nothing starts by itself and nothing more is said (watched 2 s); a question, a cancel and a Stop start nothing; the user\'s Check starts launch 2', async () => {
    const seen = observed.connector_ends_idle = await both(async (tree) => {
      const w = world(tree, [{ idle: { do: 'exit', after_ms: 150, code: 0 } }, {}]);
      await w.sub.check();
      const from = w.said.length;
      await until('the app says not available', () => w.st().state === 'unavailable');
      const r = { lost: w.st(), said: w.said.slice(from).map((s) => s.state), stand_in_exits: w.exits(), in_the_next_2_s: await watched(w) };
      r.ask = await w.sub.ask(w.request());
      w.sub.cancel('ask-qa.1');
      w.sub.stopSession('cap-other');
      r.connector_starts_before_check = w.spawns.length;
      await w.sub.check();
      Object.assign(r, { after_check: w.st(), connector_starts: w.spawns.length, stand_in_starts: w.events('start').length, asks_received: w.events('ask').length });
      await w.end();
      return r;
    });
    assert.deepEqual(seen.released, { lost: { state: 'unavailable', login: 'none', detail: null }, said: ['unavailable'], stand_in_exits: [{ on: 'idle', code: 0 }], in_the_next_2_s: NOTHING, ask: ASK_UNAVAILABLE,
      connector_starts_before_check: 1, after_check: SIGNED_IN, connector_starts: 2, stand_in_starts: 2, asks_received: 0 });
    assert.deepEqual(seen.before, seen.released);
  });

  limited('the connector ends during an account read, app side NOT changed: not available, "the connector did not answer"; the read is not made again and nothing starts by itself (watched 2 s); the user\'s Check starts launch 2 and reads signed in', async () => {
    const seen = observed.connector_ends_during_read = await both(async (tree) => {
      const w = world(tree, [{ reads: [{ do: 'result' }, { do: 'exit', code: 0 }] }, {}]);
      await w.sub.check();
      const first = w.st();
      await w.sub.check();
      const r = { first_read: first, lost: w.st(), stand_in_exits: w.exits(), in_the_next_2_s: await watched(w), connector_starts_before_check: w.spawns.length };
      await w.sub.check();
      Object.assign(r, { after_check: w.st(), connector_starts: w.spawns.length, reads_received: w.requests('connection/read') });
      await w.end();
      return r;
    });
    assert.deepEqual(seen.released, { first_read: SIGNED_IN, lost: { state: 'unavailable', login: 'none', detail: NO_ANSWER }, stand_in_exits: [{ on: 'read', code: 0 }], in_the_next_2_s: NOTHING, connector_starts_before_check: 1,
      after_check: SIGNED_IN, connector_starts: 2, reads_received: 3 });
    assert.deepEqual(seen.before, seen.released);
  });

  limited('the connector ends during a question (exit code 1), app side NOT changed: the outcome is uncertain ("no answer came; whether ChatGPT worked on the question is not known"), not available; nothing starts by itself (watched 2 s); launch 2 only on the user\'s Check; the question is NOT sent again (launch 2 gets 0 asks until a new one is asked)', async () => {
    const seen = observed.connector_ends_during_question = await both(async (tree) => {
      const w = world(tree, [{ asks: [{ do: 'exit', code: 1 }] }, { asks: [{ do: 'answer', text: SYNTHETIC_AFTER_CHECK }] }]);
      await w.sub.check();
      const first = w.request();
      const r = { outcome: await w.sub.ask(first), lost: w.st(), stand_in_exits: w.exits(), in_the_next_2_s: await watched(w), connector_starts_before_check: w.spawns.length };
      await w.sub.check();
      const launch2 = w.events('start')[1].launch_n;
      Object.assign(r, { after_check: w.st(), connector_starts: w.spawns.length, asks_received_after_check: w.events('ask').map((e) => e.request_id) });
      r.a_new_question = short(await w.sub.ask(w.request()));
      Object.assign(r, { asks_received: w.events('ask').map((e) => e.request_id), question_cancels_received: w.requests('ask/cancel'), second_start_is_launch: launch2 });
      await w.end();
      return r;
    });
    assert.deepEqual(seen.released, { outcome: UNCERTAIN, lost: { state: 'unavailable', login: 'none', detail: null }, stand_in_exits: [{ on: 'ask', code: 1 }], in_the_next_2_s: NOTHING, connector_starts_before_check: 1,
      after_check: SIGNED_IN, connector_starts: 2, asks_received_after_check: ['ask-qa.1'], a_new_question: { status: 'answered', text: SYNTHETIC_AFTER_CHECK },
      asks_received: ['ask-qa.1', 'ask-qa.2'], question_cancels_received: 0, second_start_is_launch: 1 });
    assert.deepEqual(seen.before, seen.released);
  });

  limited('the connector ends while a sign-in waits, app side NOT changed: not available, the sign-in failed, "the connector ended before the sign-in completed"; nothing starts by itself (watched 2 s); the user\'s Check starts launch 2', async () => {
    const seen = observed.connector_ends_while_sign_in_waits = await both(async (tree) => {
      const w = await waiting(tree, { connection: SIGNED_OUT, idle: { do: 'exit', after_ms: 1000, code: 1 } });
      await until('the app says not available', () => w.st().state === 'unavailable');
      const r = { lost: w.st(), stand_in_exits: w.exits(), in_the_next_2_s: await watched(w), connector_starts_before_check: w.spawns.length };
      await w.sub.check();
      Object.assign(r, { after_check: w.st(), connector_starts: w.spawns.length, handed_to_the_opener: w.opened });
      await w.end();
      return r;
    });
    assert.deepEqual(seen.released, { lost: { state: 'unavailable', login: 'failed', detail: ENDED_BEFORE_SIGN_IN }, stand_in_exits: [{ on: 'idle', code: 1 }], in_the_next_2_s: NOTHING, connector_starts_before_check: 1,
      after_check: out('failed', null), connector_starts: 2, handed_to_the_opener: [OFFICIAL] });
    assert.deepEqual(seen.before, seen.released);
  });

  limited('QA-SUB-06 the connector ends while the cancel is out: RELEASED says the sign-in failed, "the connector ended before the sign-in completed"; BEFORE kept saying cancelled. On RELEASED and on BEFORE nothing starts by itself (watched 2 s), and the user\'s Check starts a connector again', async () => {
    const seen = observed.cancel_out_connector_ends = await both(async (tree) => {
      const w = await waiting(tree, { connection: SIGNED_OUT, login_cancel: [{ do: 'exit', code: 1 }] });
      await w.sub.cancelLogin();
      const r = { lost: w.st(), stand_in_exits: w.exits(), in_the_next_2_s: await watched(w), connector_starts_before_check: w.spawns.length };
      await w.sub.check();
      Object.assign(r, { after_check: w.st(), connector_starts: w.spawns.length });
      await w.end();
      return r;
    });
    const same = { stand_in_exits: [{ on: 'login_cancel', code: 1 }], in_the_next_2_s: NOTHING, connector_starts_before_check: 1, connector_starts: 2 };
    assert.deepEqual(seen.released, { lost: { state: 'unavailable', login: 'failed', detail: ENDED_BEFORE_SIGN_IN }, after_check: out('failed', null), ...same });
    assert.deepEqual(seen.before, { lost: { state: 'unavailable', login: 'cancelled', detail: null }, after_check: out('cancelled', null), ...same });
  });

  limited('a connector the app ended (an over-long line; end_ms 0.3 s here) does NOT end at the end of its input, on THREE commits: RELEASED says so beside the state: "its wsl.exe shim was ended, which does not show ..." when ending its process ended it, "its wsl.exe shim did not end either ..." when not even that did (then the first, once that process is gone); it starts nothing in its place by itself (watched 3 s) and keeps the note after the user\'s Check, which starts launch 2. FIRST_RELEASE and BEFORE say nothing about it', async () => {
    // QA NOTE: on all three commits the user's Check starts a second connector while the first one, whose end was not
    // seen, may still be running: in the second row it IS still running beside the new one (the stand-in's process is
    // alive until this test kills it). RELEASED says that the end was not seen, and starts the new one all the same.
    // With the real connector that would be two connectors, each with a Codex app server, on one state folder. Reported.
    const rows = { ends_when_its_process_is_ended: { do: 'stay' }, does_not_end_then_either: { do: 'stay', ignore_term: true } };
    const seen = observed.connector_does_not_end = await table(rows, async (tree, at_eof, name) => {
      const w = world(tree, [{ asks: [{ do: 'fault' }], at_eof }, { asks: [{ do: 'answer', text: SYNTHETIC_AFTER_CHECK }] }], { end_ms: 300 });
      await w.sub.check();
      const from = w.said.length;
      const r = { outcome: await w.sub.ask(w.request()) };   // the over-long line: the app ends this connector
      const ended_here = Date.now();
      if (tree === 'released') await until('the app says that the connector\'s end was not seen', () => w.st().detail !== null);
      await sleep(Math.max(0, ended_here + 3000 - Date.now()));   // past the app's 0.3 s and its 2 s wait for the process it ended
      Object.assign(r, { said_in_3_s: w.said.slice(from).map(whole), connector_starts_3_s_later: w.spawns.length, stand_in_starts_3_s_later: w.events('start').length, first_process_running_3_s_later: w.alive(0),
        stand_in_logged_the_end_of_its_input: w.events('eof').length });
      await w.sub.check();
      Object.assign(r, { after_check: w.st(), connector_starts: w.spawns.length, first_process_running_beside_launch_2: w.alive(0), a_question_to_launch_2: short(await w.sub.ask(w.request('cap-2'))) });
      const last = w.said.length;
      if (w.alive(0)) w.children[0].kill('SIGKILL');   // the test ends what the app could not
      await until('the first process is gone', () => !w.alive(0));
      if (tree === 'released' && name === 'does_not_end_then_either') await until('the app says the shim ended', () => w.st().detail === SHIM_ENDED);
      Object.assign(r, { said_once_the_first_process_is_gone: w.said.slice(last).map(whole), at_the_end: w.st() });
      await w.end();
      return r;
    }, three);
    // What is said from the question on: that it is out (still signed in), not available (twice: the connector is ended,
    // the question is over), and on RELEASED, when its bounds have run out, the note.
    const down = (detail) => `unavailable, none: ${detail}`;
    const OUT = 'signed_in, none: null';
    const same = (running) => ({ outcome: UNCERTAIN, connector_starts_3_s_later: 1, stand_in_starts_3_s_later: 1, first_process_running_3_s_later: running, stand_in_logged_the_end_of_its_input: 1,
      connector_starts: 2, first_process_running_beside_launch_2: running, a_question_to_launch_2: { status: 'answered', text: SYNTHETIC_AFTER_CHECK } });
    const silent = (running) => ({ ...same(running), said_in_3_s: [OUT, down(null), down(null)], after_check: SIGNED_IN, said_once_the_first_process_is_gone: [], at_the_end: SIGNED_IN });
    assert.deepEqual(seen.ends_when_its_process_is_ended.released, { ...same(false), said_in_3_s: [OUT, down(null), down(null), down(SHIM_ENDED)], after_check: { ...SIGNED_IN, detail: SHIM_ENDED },
      said_once_the_first_process_is_gone: [], at_the_end: { ...SIGNED_IN, detail: SHIM_ENDED } });
    assert.deepEqual(seen.does_not_end_then_either.released, { ...same(true), said_in_3_s: [OUT, down(null), down(null), down(SHIM_NOT_ENDED)], after_check: { ...SIGNED_IN, detail: SHIM_NOT_ENDED },
      said_once_the_first_process_is_gone: [`signed_in, none: ${SHIM_ENDED}`], at_the_end: { ...SIGNED_IN, detail: SHIM_ENDED } });
    for (const tree of ['first_release', 'before']) {
      assert.deepEqual(seen.ends_when_its_process_is_ended[tree], silent(false), tree);
      assert.deepEqual(seen.does_not_end_then_either[tree], silent(true), tree);
    }
  });

  limited('QA-SUB-06 an address that is not official, its cancel not acknowledged, and the connector the app then ends does NOT end at the end of its input (end_ms 0.3 s here), on THREE commits: RELEASED says both, joined by "; ": why that connector is no longer used, and that its end was not seen; after the user\'s Check only the second stays. FIRST_RELEASE said only the reason; BEFORE did not end the connector', async () => {
    const seen = observed.refused_address_unacknowledged_connector_does_not_end = await three(async (tree) => {
      const w = world(tree, [{ connection: SIGNED_OUT, login_start: [{ do: 'result' }], login_cancel: [{ do: 'error', code: 'failed' }], at_eof: { do: 'stay' } }, { connection: SIGNED_OUT }], { end_ms: 300 });
      await w.sub.check();
      const from = w.said.length;
      await w.sub.login();
      const ended_here = Date.now();
      if (tree === 'released') await until('the app says that the connector\'s end was not seen', () => w.st().detail.includes('did not end by itself'));
      await sleep(Math.max(0, ended_here + 1500 - Date.now()));   // past the app's 0.3 s
      const r = { said_in_1500_ms: w.said.slice(from).map(whole), then: w.st(), first_process_running: w.alive(0), connector_starts_before_check: w.spawns.length };
      await w.sub.check();
      Object.assign(r, { after_check: w.st(), connector_starts: w.spawns.length });
      await w.end();
      return r;
    });
    const starting = 'signed_out, starting: null';
    assert.deepEqual(seen.released, { said_in_1500_ms: [starting, `unavailable, failed: ${ENDED_HERE_BEFORE_SIGN_IN}`, `unavailable, refused_address: ${ENDED_FOR_IT}`, `unavailable, refused_address: ${ENDED_FOR_IT}; ${SHIM_ENDED}`],
      then: { state: 'unavailable', login: 'refused_address', detail: `${ENDED_FOR_IT}; ${SHIM_ENDED}` }, first_process_running: false, connector_starts_before_check: 1, after_check: out('refused_address', SHIM_ENDED), connector_starts: 2 });
    assert.deepEqual(seen.first_release, { said_in_1500_ms: [starting, `unavailable, failed: ${ENDED_BEFORE_SIGN_IN}`, `unavailable, refused_address: ${ENDED_FOR_IT_FIRST_RELEASE}`],
      then: { state: 'unavailable', login: 'refused_address', detail: ENDED_FOR_IT_FIRST_RELEASE }, first_process_running: false, connector_starts_before_check: 1, after_check: out('refused_address', null), connector_starts: 2 });
    assert.deepEqual(seen.before, { said_in_1500_ms: [starting, `signed_out, refused_address: ${NOT_OPENED}`], then: out('refused_address', NOT_OPENED), first_process_running: true, connector_starts_before_check: 1,
      after_check: out('refused_address', null), connector_starts: 1 });
  });

  limited('the app\'s OWN bound for a connector\'s end (no end_ms passed; the app quits), with a connector that needs 7 s to end after the end of its input, on THREE commits: RELEASED (10 s) lets it end by itself, exit code 0, and says nothing about it; FIRST_RELEASE and BEFORE (5 s) ended its process first (SIGTERM)', async () => {
    const seen = observed.own_end_bound = await three(async (tree) => {
      const w = world(tree, [{ at_eof: { do: 'linger', ms: 7000 } }], { end_ms: undefined });
      await w.sub.check();
      const from = w.said.length;
      const at = Date.now();
      await w.sub.quit();
      const took = Date.now() - at;
      await until('the stand-in\'s process is gone', () => !w.alive(0));
      return { exported_CONNECTOR_END_MS: Module[tree].CONNECTOR_END_MS ?? null, quit_returned_after: took >= 7000 ? 'at least 7 s' : took >= 5000 ? 'at least 5 s, less than 7 s' : 'less than 5 s',
        process_ended_with: { exit_code: w.children[0].exitCode, signal: w.children[0].signalCode }, stand_in_logged_its_own_end: w.events('ended_after_linger').length, said_from_the_quit_on: w.said.slice(from).map(whole) };
    });
    assert.deepEqual(seen.released, { exported_CONNECTOR_END_MS: 10_000, quit_returned_after: 'at least 7 s', process_ended_with: { exit_code: 0, signal: null }, stand_in_logged_its_own_end: 1, said_from_the_quit_on: ['unavailable, none: null'] });
    assert.deepEqual(seen.first_release, { exported_CONNECTOR_END_MS: null, quit_returned_after: 'at least 5 s, less than 7 s', process_ended_with: { exit_code: null, signal: 'SIGTERM' }, stand_in_logged_its_own_end: 0, said_from_the_quit_on: ['unavailable, none: null'] });
    assert.deepEqual(seen.before, seen.first_release);
  });

  limited('the stand-in\'s own self-test (qa_fake_bridge.py --self-test), the checks added with this file: what it does at the end of its input (linger, stay, stay through SIGTERM) and three timings the cases rely on (with_read in one write; after_read in a write of its own, delay_ms later; idle counted from the last request, not before the first): ONLY these 19 of its 86 checks are asserted here, none of them failed; the other 67 are run and a failure among them is printed, not asserted', async () => {
    // Only those 19 are asserted here. One of the others ('scripted reads: the log', which compares the ORDER of the
    // stand-in's log with the order it wrote in) failed 2 of 28 times with four self-tests at once on one core: the
    // stand-in logs a line after writing it, from two threads. If another check fails it is printed, not asserted.
    const run = await new Promise((resolve) => execFile(PYTHON, [BRIDGE, '--self-test'], { env: { PATH: '/usr/bin:/bin' }, timeout: 25_000 }, (_error, stdout) => resolve(stdout)));
    const result = JSON.parse(run);
    const added = (name) => /^(at_eof |with_read: |after_read: |idle: )/.test(name);
    const others = result.failed.map(([name]) => name).filter((name) => !added(name));
    if (others.length) running.getStore().t.diagnostic(`self-test checks that failed and are not asserted here: ${JSON.stringify(others)}`);
    const seen = observed.stand_in_self_test = { checks: result.checks, failed_among_the_checks_added_with_this_file: result.failed.map(([name]) => name).filter(added) };
    assert.deepEqual(seen, { checks: 86, failed_among_the_checks_added_with_this_file: [] });
  });
});

limited('ONLY the connector\'s output closes and the process lives, NOT changed: the app notices nothing (still signed in, a question is sent into it and ends uncertain after the whole bound); the user\'s Check says not available but starts NO new connector, twice', async () => {
  // QA NOTE: Check connection does not recover here: the app sees a connector's end only by its exit, so it asks the
  // same mute process again and waits the whole bound each time. Same on RELEASED and BEFORE; reported.
  const seen = observed.only_the_output_closes = await both(async (tree) => {
    const w = world(tree, [{ idle: { do: 'close_output', after_ms: 150 } }, {}]);
    await w.sub.check();
    const from = w.said.length;
    await until('the end of the connector\'s output reached the app\'s pipe', () => w.outputs_ended === 1);
    w.bounds(HELD);   // from here the stand-in answers nothing
    const r = { after_the_output_closed: w.st(), notifications: w.said.length - from, not_askable: w.sub.notAskable('cap-1') };
    r.ask = await w.sub.ask(w.request());
    r.after_the_question = w.st();
    await w.sub.check();
    Object.assign(r, { after_check: w.st(), connector_starts_after_check: w.spawns.length });
    await w.sub.check();
    Object.assign(r, { after_a_second_check: w.st(), connector_starts: w.spawns.length, process_still_running: w.alive(0) });
    await w.end();
    await until('the stand-in logged the end of its input', () => w.events('eof').length === 1);
    const log = w.log();
    Object.assign(r, { stand_in: { starts: w.events('start').length, events: log.map((e) => (e.event === 'request' ? e.method : e.event)) } });
    return r;
  });
  const mute = { state: 'unavailable', login: 'none', detail: NO_ANSWER };
  assert.deepEqual(seen.released, { after_the_output_closed: SIGNED_IN, notifications: 0, not_askable: null, ask: UNCERTAIN, after_the_question: SIGNED_IN, after_check: mute, connector_starts_after_check: 1,
    after_a_second_check: mute, connector_starts: 1, process_still_running: true,
    stand_in: { starts: 1, events: ['start', 'connection/read', 'sent', 'output_closed', 'ask', 'ask/cancel', 'connection/read', 'connection/read', 'eof'] } });
  assert.deepEqual(seen.before, seen.released);
});

// ================================================================= retained controls
limited('RETAINED CONTROLS, on THREE commits: the 16 outcomes of the display controls that reach the connector (FAKE_BRIDGE_SCRIPT and FAKE_ASKS of scenarios.mjs, in that order) are on RELEASED exactly what they are on FIRST_RELEASE and on BEFORE; among them the app\'s own confirmed Cancel (k9, k10) and Stop (k12): cancelled, uncertain false', async () => {
  const seen = observed.retained_controls = await three(async (tree) => {
    const w = world(tree, FAKE_BRIDGE_SCRIPT.launches);
    const ask = (session) => w.sub.ask(w.request(session, SURFACE_QUESTION));
    const k = {};
    const at = { before_check: { ...w.st(), not_askable: w.sub.notAskable('cap-1'), connector_starts: w.spawns.length } };
    await w.sub.check();
    at.checked = { ...w.st(), model: w.sub.status().model, plan: w.sub.status().plan };
    for (const label of FAKE_ASKS.slice(0, 8)) k[label] = short(await ask('cap-1'));
    // the stand-in holds the question; Cancel (or Stop) is pressed once it has it
    k.k9_cancel_confirmed = await heldQuestion(w, 'cap-1', (id) => w.sub.cancel(id));
    k.k10_cancel_late_answer = await heldQuestion(w, 'cap-1', (id) => w.sub.cancel(id));
    await until('the answer written after the cancel was handed to the app', () => w.got.filter((l) => l.late).length === 1);
    k.k11_cancel_unconfirmed = await heldQuestion(w, 'cap-1', (id) => w.sub.cancel(id));
    k.k12_stop_in_flight = await heldQuestion(w, 'cap-1', () => w.sub.stopSession('cap-1'));
    await until('the answer written after the Stop was handed to the app', () => w.got.filter((l) => l.late).length === 2);
    at.stopped = { ...w.st(), same_session_again: w.sub.notAskable('cap-1') };
    k.k13_new_session = short(await ask('cap-2'));
    k.k14_fault = short(await ask('cap-2'));
    await until('the app says not available', () => w.st().state === 'unavailable');
    at.fault = { ...w.st(), not_askable: w.sub.notAskable('cap-2'), connector_starts: w.spawns.length };
    await w.sub.check();
    at.rechecked = { ...w.st(), connector_starts: w.spawns.length };
    k.k15_after_recheck = short(await ask('cap-2'));
    k.k16_unauthenticated = short(await ask('cap-2'));
    at.end = { ...w.st(), not_askable: w.sub.notAskable('cap-2') };
    await w.end();
    await until('both starts of the stand-in logged the end of their input', () => w.events('eof').length === 2);
    const log = w.log();
    const stand_in = { starts: w.events('start').length, ends_of_input: w.events('eof').length, asks: w.events('ask').map((e) => e.behaviour),
      requests: Object.fromEntries(['connection/read', 'ask/cancel', 'session/stop', 'connection/login/start', 'connection/login/cancel'].map((m) => [m, w.requests(m)])),
      one_question_each: new Set(w.events('ask').map((e) => e.request_id)).size, answers_written: log.filter((e) => e.event === 'sent' && e.kind === 'answer').length,
      over_long_line_bytes: log.filter((e) => e.event === 'sent' && e.kind === 'fault').map((e) => e.bytes) };
    return { k, at, stand_in, logins_said: [...new Set(w.said.map((s) => s.login))], opened: w.opened,
      command: w.spawns[0].map((a) => (a === w.folder ? '<temp>' : a === BRIDGE ? '<qa_fake_bridge.py>' : a)) };
  });
  const refusedAs = (code, reason) => ({ status: 'refused', code, reason });
  assert.deepEqual(Object.keys(seen.released.k), FAKE_ASKS);
  assert.deepEqual(seen.released.k, {
    k1_answered: { status: 'answered', text: `${SYN} First control answer.` },
    k2_tampered: refusedAs('unbound', 'the answer is not bound to the request that was sent; it is not shown'),
    k3_quota: refusedAs('quota', 'the subscription\'s usage limit was reached'),
    k4_busy: refusedAs('busy', 'another question is still being answered'),
    k5_unsupported_model: refusedAs('unsupported_model', 'the chosen model does not take pictures'),
    k6_invalid_request: refusedAs('invalid_request', 'the connector refused the request as malformed'),
    k7_failed: refusedAs('failed', 'ChatGPT did not complete an answer'),
    k8_unavailable: refusedAs('unavailable', UNAVAILABLE),
    k9_cancel_confirmed: { status: 'cancelled', uncertain: false },
    k10_cancel_late_answer: { status: 'cancelled', uncertain: false },
    k11_cancel_unconfirmed: { status: 'cancelled', uncertain: true },
    k12_stop_in_flight: { status: 'cancelled', uncertain: false },
    k13_new_session: { status: 'answered', text: `${SYN} Answer in the second capture session.` },
    k14_fault: UNCERTAIN,
    k15_after_recheck: { status: 'answered', text: `${SYN} Answer from the second bridge start.` },
    k16_unauthenticated: refusedAs('unauthenticated', 'ChatGPT is not signed in (sign in from the control window)'),
  });
  assert.deepEqual(seen.released.at, {
    before_check: { state: 'not_checked', login: 'none', detail: null, not_askable: 'the ChatGPT subscription has not been checked yet (use the control window)', connector_starts: 0 },
    checked: { ...SIGNED_IN, model: 'qa-synthetic-vision', plan: 'QA-SYNTHETIC' },
    stopped: { ...SIGNED_IN, same_session_again: 'this capture session was stopped' },
    fault: { state: 'unavailable', login: 'none', detail: NO_ANSWER, not_askable: UNAVAILABLE, connector_starts: 1 },
    rechecked: { ...SIGNED_IN, connector_starts: 2 },
    end: { state: 'signed_out', login: 'none', detail: null, not_askable: 'ChatGPT is not signed in (sign in from the control window)' },
  });
  assert.deepEqual(seen.released.stand_in, { starts: 2, ends_of_input: 2, asks: [...FAKE_BRIDGE_SCRIPT.launches[0].asks, ...FAKE_BRIDGE_SCRIPT.launches[1].asks].map((b) => b.do),
    requests: { 'connection/read': 3, 'ask/cancel': 3, 'session/stop': 1, 'connection/login/start': 0, 'connection/login/cancel': 0 }, one_question_each: 16, answers_written: 4 + 2, over_long_line_bytes: [300 * 1024] });   // 4 answers shown or refused as unbound, 2 written late and dropped
  assert.deepEqual([seen.released.logins_said, seen.released.opened], [['none'], []]);
  assert.deepEqual(seen.released.command, ['wsl.exe', '--distribution', 'qa-offline', '--user', 'qa-offline', '--cd', '<temp>', '--exec', '<qa_fake_bridge.py>', '-m', 'services.worker.connectors.chatgpt_local']);
  assert.deepEqual(seen.first_release, seen.released);
  assert.deepEqual(seen.before, seen.released);
});

// ================================================================= the stand-in itself
// The committed stand-in (the one the display controls passed with) and the extended one, given the same lines.
const COMMITTED_BRIDGE = 'd6ecc9884c92edd60db15e1aea01ceae6a83e24b';
let committedFile = null;
const committedBridge = () => {
  if (!committedFile) writeFileSync(committedFile = join(temp(), 'qa_fake_bridge.py'), execFileSync('git', ['-C', REPO, 'show', `${COMMITTED_BRIDGE}:tests/e2e/windows/qa_fake_bridge.py`]));
  return committedFile;
};
const line = (id, method, params, version = 'lc-subscription-ask/1') => `${JSON.stringify({ version, id, method, params })}\n`;
const askLine = (n, session = 'cap-1', question = SURFACE_QUESTION) => line(`a${n}`, 'ask/start', { model: 'qa-synthetic-vision', request: { request_id: `ask-x.${n}`, question, assistance: 'explain',
  image: { png_base64: PNG.toString('base64'), sha256: createHash('sha256').update(PNG).digest('hex'), width: 1, height: 1 }, context: { capture_session_id: session, frame_seq: 1 } } });

limited('a question holding half of a surrogate pair, handed STRAIGHT to the class: NOT changed, the class has no check of its own on RELEASED or BEFORE (the refusal of QA-SUB-04 is made before it, in questionOf and submitAsk, which this file does not run), so it is sent as it is. The extended stand-in logs it as not well-formed, answers and lives on; the committed stand-in died there without logging the ask', async () => {
  const LONE = 'What is \ud83d this?';   // the first half of a pair, alone
  const WHOLE = '这道题 😀 é';   // Chinese, a whole pair (an emoji), an accented letter
  const sha = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
  // QA NOTE: `Subscription.ask` takes whatever question it is handed. This case does NOT show QA-SUB-04 corrected or
  // not: it shows that the stand-in would now record such a question if a later change let one through to the connector.
  const seen = observed.lone_surrogate_straight_to_the_class = await both(async (tree) => {
    const w = world(tree, [{ asks: [{ do: 'answer', text: `${SYN} A.` }, { do: 'answer', text: `${SYN} B.` }] }]);
    await w.sub.check();
    const r = { lone: short(await w.sub.ask(w.request('cap-1', LONE))).status, whole: short(await w.sub.ask(w.request('cap-1', WHOLE))).status };
    Object.assign(r, { logged: w.events('ask').map((e) => ({ chars: e.question_chars, well_formed: e.question_well_formed })), whole_text_hash_is_its_utf8: w.events('ask')[1].question_sha256 === sha(WHOLE), connector_starts: w.spawns.length });
    await w.end();
    return r;
  });
  assert.deepEqual(seen.released, { lone: 'answered', whole: 'answered', logged: [{ chars: [...LONE].length, well_formed: false }, { chars: [...WHOLE].length, well_formed: true }], whole_text_hash_is_its_utf8: true, connector_starts: 1 });   // the stand-in counts characters, not UTF-16 units
  assert.deepEqual(seen.before, seen.released);
  // The same two questions as lines, to each stand-in alone.
  const alone = (file) => {
    const folder = temp();
    writeFileSync(join(folder, 'bridge-script.json'), JSON.stringify({ launches: [{ asks: [{ do: 'answer', text: 'A' }, { do: 'answer', text: 'B' }] }] }));
    const run = spawnSync(PYTHON, [file, '-m', 'services.worker.connectors.chatgpt_local'], { cwd: folder, input: askLine(1, 'cap-1', LONE) + askLine(2, 'cap-1', WHOLE), encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: '/usr/bin:/bin' } });
    const log = readFileSync(join(folder, 'bridge-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    return { exit_code: run.status, lines_written: run.stdout.split('\n').length - 1, logged: log.map((e) => e.event) };
  };
  const stand_ins = seen.stand_ins = { committed: alone(committedBridge()), extended: alone(BRIDGE) };
  assert.deepEqual(stand_ins, { committed: { exit_code: 1, lines_written: 0, logged: ['start'] }, extended: { exit_code: 0, lines_written: 2, logged: ['start', 'ask', 'sent', 'ask', 'sent', 'eof'] } });
});

limited('the stand-in itself: for the two scripts of the display controls (FAKE_BRIDGE_SCRIPT, REHEARSAL_BRIDGE_SCRIPT) the extended qa_fake_bridge.py writes, line for line, what the committed one (d6ecc98) writes, and logs the same but for one added key', async () => {
  const ask = askLine;
  // Each step: the lines written to it, and how many lines it must have written back (and logged as sent) in all before
  // the next step, so that the order of its log does not depend on how busy this machine is.
  const controls = [[[line('r1', 'connection/read', {}), ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ask(n))], 9],
    [[ask(9), line('c9', 'ask/cancel', { request_id: 'ask-x.9' })], 11], [[ask(10), line('c10', 'ask/cancel', { request_id: 'ask-x.10' })], 14], [[ask(11), line('c11', 'ask/cancel', { request_id: 'ask-x.11' })], 16],
    [[ask(12), line('s1', 'session/stop', { capture_session_id: 'cap-1' })], 19], [[ask(13, 'cap-2')], 20],
    [[line('l1', 'connection/login/start', {}), line('l2', 'connection/login/cancel', { login_id: 'x' }), line('u1', 'qa/unknown', {}), line('v1', 'connection/read', {}, 'another-version'), 'not json\n'], 25],
    [[ask(14, 'cap-2')], 26], [[line('r2', 'connection/read', {})], 28]];
  const again = [[[line('r1', 'connection/read', {}), ask(15, 'cap-2'), ask(16, 'cap-2'), ask(17, 'cap-2')], 4]];
  const rehearsal = [[[line('r1', 'connection/read', {}), ask(1)], 2]];
  const run = async (file, folder, steps) => {
    const child = spawn(PYTHON, [file, '-m', 'services.worker.connectors.chatgpt_local'], { cwd: folder, stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: '/usr/bin:/bin' } });
    const chunks = [];
    child.stdout.on('data', (c) => chunks.push(c));
    const lines = () => Buffer.concat(chunks).toString('latin1').split('\n').slice(0, -1);
    const exited = new Promise((r) => child.once('exit', (code) => r(code)));
    const logged = () => (existsSync(join(folder, 'bridge-log.jsonl')) ? readFileSync(join(folder, 'bridge-log.jsonl'), 'utf8').split('"event": "sent"').length - 1 : 0);
    const before = logged();   // (an earlier start in this folder logged these)
    try {
      for (const [write, n] of steps) {
        child.stdin.write(write.join(''));
        await until(`${n} lines from the stand-in, each logged`, () => lines().length >= n && logged() - before >= n);
      }
    } finally {
      child.stdin.end();   // (also when a step was not answered: the stand-in ends at the end of its input)
    }
    return { code: await exited, lines: lines().map((l) => (l.length > 4096 ? `<${l.length} bytes of ${[...new Set(l)].join('')}>` : l)) };
  };
  const logOf = (folder) => readFileSync(join(folder, 'bridge-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map(({ at, launch, pid, question_well_formed, ...rest }) => rest);
  const seen = {};
  for (const [name, script, runs] of [['controls', FAKE_BRIDGE_SCRIPT, [controls, again]], ['rehearsal', REHEARSAL_BRIDGE_SCRIPT, [rehearsal]]]) {
    const sides = await Promise.all([[committedBridge(), 'committed'], [BRIDGE, 'extended']].map(async ([file, side]) => {
      const folder = temp();
      writeFileSync(join(folder, 'bridge-script.json'), JSON.stringify(script));
      const starts = [];
      for (const steps of runs) starts.push(await run(file, folder, steps));
      return { side, starts, log: logOf(folder), well_formed_key: readFileSync(join(folder, 'bridge-log.jsonl'), 'utf8').split('"question_well_formed": true').length - 1 };
    }));
    const [old, now] = sides;
    assert.deepEqual(now.starts, old.starts, `${name}: the lines written`);
    assert.deepEqual(now.log, old.log, `${name}: the log`);
    assert.deepEqual([old.well_formed_key, now.well_formed_key], [0, now.log.filter((e) => e.event === 'ask').length], `${name}: the one added key`);
    seen[name] = { starts: now.starts.length, lines_written: now.starts.map((s) => s.lines.length), exit_codes: now.starts.map((s) => s.code), log_entries: now.log.length, asks_logged: now.well_formed_key };
  }
  observed.stand_in_as_committed = seen;
  assert.deepEqual(seen, { controls: { starts: 2, lines_written: [28, 4], exit_codes: [0, 0], log_entries: 64, asks_logged: 17 }, rehearsal: { starts: 1, lines_written: [2], exit_codes: [0], log_entries: 6, asks_logged: 1 } });
});
