// node --test tests/e2e/windows/signin_launcher.test.mjs
// The launcher's own `check`, as it is written, with Windows played (signin_played_windows.mjs). No Windows, no display:
// the launcher runs in a Node that may start no program at all (--permission) and may write only in a folder of this test.
// The first test waits the launcher's real 20 s.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMIT = 'a'.repeat(40);
const STAGE = 'lc-qa-stage';
const RUNTIME = 'lc-electron-44.5.1-win32-x64';
const EXE = `C:\\T\\${RUNTIME}\\electron.exe`;
const app = (pid, more = '') => ({ pid, created: '2000', exe: EXE, command_line: `"${EXE}" "C:\\T\\${STAGE}" --remote-debugging-port={port} --remote-debugging-address=127.0.0.1${more}` });
const child = (pid, type, over = {}) => ({ pid, created: '2050', exe: EXE, command_line: `"${EXE}" --type=${type}`, ...over });
const other = (pid, over = {}) => ({ pid, created: '500', exe: 'C:\\Other\\electron.exe', command_line: '"C:\\Other\\electron.exe" C:\\Other\\app', ...over });

const made = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

// Runs `check` on the played looks. The first look is the one before anything is started.
function check(looks) {
  const dir = mkdtempSync(join(tmpdir(), 'qa-signin-launcher-test-'));
  made.push(dir);
  const url = (name) => pathToFileURL(join(HERE, name)).href;
  const source = readFileSync(join(HERE, 'signin_launcher.mjs'), 'utf8')
    .replace("from 'node:child_process';", `from '${url('signin_played_windows.mjs')}';`).replace("from './sub_copy.mjs';", `from '${url('signin_played_windows.mjs')}';`)
    .replace("from './signin_cleanup.mjs';", `from '${url('signin_cleanup.mjs')}';`);
  assert.equal(source.split(url('signin_played_windows.mjs')).length - 1, 2);
  assert.equal(/^import .*(node:child_process|sub_copy)/m.test(source) || /\bimport\(/.test(source), false, 'the launcher is not wholly played: not run');
  writeFileSync(join(dir, 'launcher.mjs'), source);
  const temp = join(dir, 'temp');
  mkdirSync(join(temp, STAGE, 'dist', 'apps', 'windows', 'src', 'main'), { recursive: true });
  writeFileSync(join(temp, STAGE, 'dist', 'apps', 'windows', 'src', 'main', 'main.js'), '');
  mkdirSync(join(temp, RUNTIME));
  writeFileSync(join(temp, RUNTIME, 'electron.exe'), 'a placeholder, never run');
  const entry = join(temp, `lc-subscription-signin-${COMMIT.slice(0, 12)}`);
  mkdirSync(entry);
  writeFileSync(join(entry, 'Start-Learning-Companion-Subscription.cmd'), '@echo off\r\n');
  writeFileSync(join(entry, 'connector.json'), '{}');
  mkdirSync(join(dir, 'home'));
  const r = spawnSync(process.execPath, ['--permission', '--allow-fs-read=*', `--allow-fs-write=${dir}/*`, join(dir, 'launcher.mjs'), 'check', COMMIT],
    { encoding: 'utf8', cwd: dir, timeout: 120000, env: { PATH: '/nonexistent', HOME: join(dir, 'home'), QA_STAGE_NAME: STAGE, QA_PLAYED_TEMP: temp, QA_PLAYED_LOOKS: JSON.stringify(looks) } });
  let said = null;
  try { said = JSON.parse(r.stdout); } catch { /* a refusal prints no result */ }
  return { code: r.status, said, cleanup: said?.cleanup, stderr: r.stderr, signalled: /PLAYED: a signal command was run/.test(r.stderr),
    checkFolders: readdirSync(temp).filter((name) => /-check-\d+$/.test(name)), entryKept: existsSync(join(entry, 'connector.json')) };
}

test('the launcher: a process it started that later shows a --type= command line (same PID, same creation time) is not taken as gone: unknown, nothing signalled, its folder kept, exit code 3', () => {
  const r = check([[], [app(741)], [app(741, ' --type=renderer')]]);
  assert.deepEqual([r.code, r.cleanup?.exit, r.cleanup?.folder, r.cleanup?.owned_seen, r.cleanup?.not_revalidated, r.cleanup?.signals, r.signalled, r.checkFolders.length],
    [3, 'unknown', 'kept', [{ pid: 741, created: '2000', kind: 'app' }], [{ pid: 741, created: '2000' }], [], false, 1], r.stderr);
  assert.match(r.stderr, /NOT RELEASED: a process this check started is still there but can no longer be shown to be the same launch/);
});

test('the launcher: the app ends by itself beside child processes and an app that opened meanwhile: confirmed, the check\'s folder removed, nothing signalled, children reported apart from the other app, exit code 0', () => {
  const crash = child(7, 'crashpad-handler', { created: '500', exe: 'C:\\Other\\electron.exe' });       // there before the start: a child, not an open app
  const late = other(9, { created: '1800' });
  const r = check([[crash], [app(41), child(51, 'renderer'), crash], [app(41), child(51, 'renderer'), crash, late], [child(51, 'renderer'), crash, late]]);
  assert.deepEqual([r.code, r.cleanup?.exit, r.cleanup?.folder, r.cleanup?.owned_seen, r.cleanup?.children, r.cleanup?.foreign, r.said?.electron_apps_not_this_checks, r.signalled, r.checkFolders, r.entryKept],
    [0, 'confirmed', 'removed', [{ pid: 41, created: '2000', kind: 'app' }], [51, 7], [9], [9], false, [], true], r.stderr);
  assert.match(r.stderr, /NOTE: an Electron app that is not this check's was open at the end \(PIDs \[9\]\)/);
  assert.doesNotMatch(r.stderr, /NOT RELEASED|FOLDER LEFT/);
  assert.equal(r.said.check.after.state, 'signed_out');
});

test('the launcher: before the start it refuses beside an open Electron app, a process it cannot read, or a child without a creation time; nothing is made', () => {
  for (const row of [other(9), other(8, { command_line: null }), child(7, 'gpu-process', { created: null })]) {
    const r = check([[row]]);
    assert.deepEqual([r.code, r.said, r.checkFolders, r.signalled], [2, null, [], false], r.stderr);
    assert.match(r.stderr, /REFUSED, nothing was started: an Electron app is open/);
  }
});
