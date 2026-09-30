// Bounded, foreground diagnostic; native Windows Node, stdlib only.
// Creates/removes only its own synthetic temp directory. No uploader/GUI/network.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

assert.equal(process.platform, 'win32', 'Run with native Windows Node');
const source = 'd49d101cd8d378e57ea54da6cb38fb89b80bb72c';
// Exact PowerShell literal from apps/windows/tests/uploader.test.ts:74 at source.
const legacy = "$f = [System.IO.File]::Open($env:LC_HOLD_FILE, 'Open', 'Read', 'None'); [Console]::Out.WriteLine('held'); [Console]::Out.Flush(); [void][Console]::In.ReadLine(); $f.Close()";
const traced = (raw) => `
$ErrorActionPreference = 'Stop'
$f = $null
$handle = $null
function Emit($value) {
  [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
try {
  $full = [IO.Path]::GetFullPath($env:LC_HOLD_FILE)
  $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($full))
  Emit @{ event='opening'; pid=$PID; executable=[Diagnostics.Process]::GetCurrentProcess().MainModule.FileName;
    path=$full; exists=[IO.File]::Exists($full);
    powershell=$PSVersionTable.PSVersion.ToString(); clr=[Environment]::Version.ToString();
    filesystem=$drive.DriveFormat; input_redirected=[Console]::IsInputRedirected;
    input_type=[Console]::In.GetType().FullName }
  $f = [IO.File]::Open($full, 'Open', 'Read', 'None')
  $handle = $f.SafeFileHandle
  $other = $null
  try {
    $other = [IO.File]::Open($full, 'Open', 'Read', 'ReadWrite')
    Emit @{ event='dotnet_second_open'; denied=$false }
  } catch {
    Emit @{ event='dotnet_second_open'; denied=$true; hresult=$_.Exception.InnerException.HResult }
  } finally { if ($null -ne $other) { $other.Dispose() } }
  Emit @{ event='held'; path=$f.Name; can_read=$f.CanRead; closed=$handle.IsClosed }
  ${raw ? '$value = [Console]::OpenStandardInput().ReadByte()' : '$value = [Console]::In.ReadLine()'}
  Emit @{ event='input_returned'; is_null=($null -eq $value); value=$value }
} catch {
  Emit @{ event='helper_error'; type=$_.Exception.GetType().FullName; hresult=$_.Exception.HResult }
  exit 2
} finally {
  if ($null -ne $f) { $f.Dispose(); Emit @{ event='disposed'; closed=$handle.IsClosed } }
}
`;

async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' timeout')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

function readAttempt(file) {
  try {
    const bytes = fs.readFileSync(file); // Real open and read, not an access() guess.
    return { denied: false, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  } catch (error) {
    return { denied: true, code: error.code, errno: error.errno, syscall: error.syscall };
  }
}

function openAttempt(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r'); // Exact failing hosted precondition, separately from real read.
    const st = fs.fstatSync(fd, { bigint: true });
    return { denied: false, dev: String(st.dev), ino: String(st.ino), bytes: Number(st.size) };
  } catch (error) {
    return { denied: true, code: error.code, errno: error.errno, syscall: error.syscall };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

async function observe(result, script, file) {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  result.script_sha256 = createHash('sha256').update(script).digest('hex');
  result.events = [];
  const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, LC_HOLD_FILE: file }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  result.pid = helper.pid;
  let heldResolve;
  let buffer = '';
  let outputBytes = 0;
  let stderr = '';
  let childClosed = false;
  const held = new Promise(resolve => { heldResolve = resolve; });
  const closed = new Promise(resolve => helper.once('close', (code, signal) => {
    childClosed = true;
    result.events.push({ event: 'child_close', at_ms: elapsed(), code, signal });
    heldResolve(false);
    resolve({ code, signal });
  }));
  helper.on('error', error => { result.spawn_error = error.code; heldResolve(false); });
  helper.stdin.on('error', error => { result.stdin_error = error.code; });
  helper.on('exit', (code, signal) => result.events.push({ event: 'child_exit', at_ms: elapsed(), code, signal }));
  helper.stdout.setEncoding('utf8');
  helper.stdout.on('data', chunk => {
    outputBytes += Buffer.byteLength(chunk);
    if (outputBytes > 16384) { result.output_error = 'stdout exceeded bound'; heldResolve(false); return; }
    buffer += chunk;
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n');
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      let event;
      try { event = JSON.parse(line); } catch { event = { event: 'text', value: line }; }
      result.events.push({ ...event, at_ms: elapsed() });
      if (event.event === 'held' || line === 'held') heldResolve(true);
    }
  });
  helper.stderr.setEncoding('utf8');
  helper.stderr.on('data', chunk => {
    if (stderr.length < 8192) stderr = (stderr + chunk).slice(0, 8192);
  });
  const snapshot = () => ({ exitCode: helper.exitCode, signalCode: helper.signalCode,
    stdin_ended: helper.stdin.writableEnded, stdin_destroyed: helper.stdin.destroyed, at_ms: elapsed() });
  try {
    result.held_received = await bounded(held, 10000, 'readiness');
    result.after_ready = { process: snapshot(), open: openAttempt(file), read: readAttempt(file) };
    // One delayed observation, not a readiness/polling loop. No input sent yet.
    await delay(150);
    result.after_150ms = { process: snapshot(), open: openAttempt(file), read: readAttempt(file) };
  } catch (error) {
    result.error = error.message;
  } finally {
    result.events.push({ event: 'parent_release', at_ms: elapsed() });
    helper.stdin.end('release-probe\n');
    try {
      try {
        result.exit = await bounded(closed, 2000, 'release');
      } catch {
        // This exact ChildProcess is owned; never kill by name or process tree.
        result.force_kill = helper.kill();
        result.exit = await bounded(closed, 3000, 'owned helper close');
      }
    } catch (error) { result.cleanup_error = error.message; }
    result.stderr = stderr;
    result.after_release = readAttempt(file);
    result.completed = childClosed && !result.error && !result.spawn_error && !result.output_error;
    result.lock_precondition_passed = result.held_received === true
      && result.after_ready?.open.code === 'EBUSY' && result.after_150ms?.open.code === 'EBUSY'
      && result.after_ready?.read.code === 'EBUSY' && result.after_150ms?.read.code === 'EBUSY'
      && result.after_release.denied === false;
    result.normal_release_passed = result.exit?.code === 0 && result.exit?.signal === null
      && result.force_kill === undefined && result.stdin_error === undefined
      && result.after_150ms?.process.exitCode === null && result.after_150ms?.process.signalCode === null;
    result.duration_ms = elapsed();
  }
  return result;
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-support-share-'));
const file = path.join(directory, 'synthetic-original.txt');
const report = {
  scope: 'Local synthetic file/owned PowerShell lifetime only; no uploader, hosted acceptance or GUI',
  date_utc: new Date().toISOString(), source,
  probe_sha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  parent: { node: process.version, uv: process.versions.uv, platform: process.platform,
    executable: process.execPath, os_release: os.release(), cwd: process.cwd() },
  results: [],
};
try {
  fs.writeFileSync(file, 'Synthetic support lock probe only.\n', { flag: 'wx' });
  const st = fs.statSync(file, { bigint: true });
  report.target = { path: file, realpath: fs.realpathSync(file), dev: String(st.dev), ino: String(st.ino), bytes: Number(st.size) };
  for (const [name, script] of [['exact-legacy', legacy], ['traced-readline', traced(false)], ['traced-raw-stdin', traced(true)]]) {
    const result = { name };
    report.results.push(result); // Preserve this arm even if its cleanup cannot be confirmed.
    await observe(result, script, file);
    if (result.cleanup_error) break; // No more children after an unconfirmed cleanup.
  }
} catch (error) {
  report.error = error.message;
} finally {
  try { fs.rmSync(directory, { recursive: true }); report.own_temp_removed = true; }
  catch (error) { report.cleanup_error = error.code; }
  report.observation_complete = report.results.length === 3 && report.results.every(r => r.completed) && report.own_temp_removed === true;
  report.lock_preconditions_passed = report.observation_complete && report.results.every(r => r.lock_precondition_passed);
  report.normal_release_passed = report.observation_complete && report.results.every(r => r.normal_release_passed);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.lock_preconditions_passed && report.normal_release_passed ? 0 : 1;
}
