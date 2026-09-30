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
const source = '4166529b88e9be402ad98241d609eadccd4247bd';
// Read-only native queries on the owned file and the two probe processes.
// No token adjustment, ACL change, process enumeration or native dependency.
const native = `
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using FILETIME = System.Runtime.InteropServices.ComTypes.FILETIME;
using System.Text;
using Microsoft.Win32.SafeHandles;
public static class SupportFileFacts {
  [StructLayout(LayoutKind.Sequential)]
  public struct FileInfo {
    public uint Attributes;
    public FILETIME Created, Accessed, Written;
    public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct Luid { public uint Low; public int High; }
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetFileInformationByHandle(SafeFileHandle h, out FileInfo info);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern uint GetFinalPathNameByHandleW(SafeFileHandle h, StringBuilder name, uint length, uint flags);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFileW(string file, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool ReadFile(SafeFileHandle h, byte[] bytes, uint length, out uint count, IntPtr overlapped);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool CloseHandle(IntPtr h);
  [DllImport("advapi32.dll", SetLastError=true)]
  static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)]
  static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr buffer, uint size, out uint required);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool LookupPrivilegeValue(string system, string name, out Luid id);
  public static Dictionary<string,object> Identity(SafeFileHandle h) {
    FileInfo info;
    if (!GetFileInformationByHandle(h, out info)) throw new Win32Exception(Marshal.GetLastWin32Error());
    var name = new StringBuilder(1024);
    uint length = GetFinalPathNameByHandleW(h, name, (uint)name.Capacity, 0);
    if (length == 0 || length >= name.Capacity) throw new InvalidOperationException("final_path_unavailable");
    return new Dictionary<string,object> {
      {"dev", info.Volume.ToString()},
      {"ino", (((ulong)info.IndexHigh << 32) | info.IndexLow).ToString()},
      {"bytes", (((ulong)info.SizeHigh << 32) | info.SizeLow).ToString()},
      {"final_path", name.ToString()}
    };
  }
  public static Dictionary<string,object> TryOpen(string file, uint access, uint flags) {
    var result = new Dictionary<string,object> {{"access", access}, {"flags", flags}};
    using (var h = CreateFileW(file, access, 7, IntPtr.Zero, 3, flags, IntPtr.Zero)) {
      int error = Marshal.GetLastWin32Error();
      result["opened"] = !h.IsInvalid;
      if (h.IsInvalid) { result["open_error"] = error; return result; }
      result["identity"] = Identity(h);
      var bytes = new byte[35];
      uint count;
      bool ok = ReadFile(h, bytes, (uint)bytes.Length, out count, IntPtr.Zero);
      error = Marshal.GetLastWin32Error();
      result["read_ok"] = ok;
      result["read_error"] = ok ? 0 : error;
      result["bytes_read"] = count;
    }
    return result;
  }
  public static Dictionary<string,object> Privileges(uint pid) {
    var result = new Dictionary<string,object> {{"pid", pid}};
    IntPtr process = IntPtr.Zero, token = IntPtr.Zero, buffer = IntPtr.Zero;
    try {
      process = OpenProcess(0x1000, false, pid); // QUERY_LIMITED_INFORMATION only.
      if (process == IntPtr.Zero || !OpenProcessToken(process, 8, out token))
        throw new Win32Exception(Marshal.GetLastWin32Error()); // TOKEN_QUERY only.
      uint size;
      GetTokenInformation(token, 3, IntPtr.Zero, 0, out size); // TokenPrivileges.
      if (size < 4 || size > 65536) throw new InvalidOperationException("privilege_size");
      buffer = Marshal.AllocHGlobal((int)size);
      if (!GetTokenInformation(token, 3, buffer, size, out size)) throw new Win32Exception(Marshal.GetLastWin32Error());
      int count = Marshal.ReadInt32(buffer);
      if (count < 0 || 4L + 12L * count > size) throw new InvalidOperationException("privilege_count");
      foreach (string name in new[] {"SeBackupPrivilege", "SeRestorePrivilege"}) {
        Luid wanted;
        if (!LookupPrivilegeValue(null, name, out wanted)) throw new Win32Exception(Marshal.GetLastWin32Error());
        bool present = false;
        uint attributes = 0;
        for (int i = 0; i < count; ++i) {
          int at = 4 + 12 * i;
          if (unchecked((uint)Marshal.ReadInt32(buffer, at)) == wanted.Low && Marshal.ReadInt32(buffer, at + 4) == wanted.High) {
            present = true; attributes = unchecked((uint)Marshal.ReadInt32(buffer, at + 8)); break;
          }
        }
        result[name] = new Dictionary<string,object> {{"present", present}, {"enabled", present && (attributes & 2) != 0}, {"attributes", attributes}};
      }
    } catch (Win32Exception e) { result["query_error"] = e.NativeErrorCode; }
      catch (Exception e) { result["query_error_type"] = e.GetType().FullName; }
    finally {
      if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer);
      if (token != IntPtr.Zero) CloseHandle(token);
      if (process != IntPtr.Zero) CloseHandle(process);
    }
    return result;
  }
}
`;
const traced = (rangeLock) => `
$ErrorActionPreference = 'Stop'
$f = $null
$handle = $null
$locked = $false
function Emit($value) {
  [Console]::Out.WriteLine(($value | ConvertTo-Json -Depth 8 -Compress))
  [Console]::Out.Flush()
}
try {
  Add-Type -TypeDefinition @'
${native}
'@
  $full = [IO.Path]::GetFullPath($env:LC_HOLD_FILE)
  Emit @{ event='opening'; path=$full; powershell=$PSVersionTable.PSVersion.ToString();
    clr=[Environment]::Version.ToString(); filesystem=([IO.DriveInfo]::new([IO.Path]::GetPathRoot($full))).DriveFormat;
    parent_privileges=[SupportFileFacts]::Privileges([uint32]$env:LC_PROBE_PARENT_PID);
    helper_privileges=[SupportFileFacts]::Privileges([uint32]$PID) }
  $f = [IO.File]::Open($full, 'Open', 'Read', '${rangeLock ? 'ReadWrite, Delete' : 'None'}')
  $handle = $f.SafeFileHandle
  ${rangeLock ? '$f.Lock(0, $f.Length); $locked = $true' : ''}
  foreach ($access in [uint32]2147483648, [uint32]1179785) {
    foreach ($flags in [uint32]128, [uint32]33554560) {
      Emit @{ event='native_open'; result=[SupportFileFacts]::TryOpen($full, $access, $flags) }
    }
  }
  Emit @{ event='held'; path=$f.Name; identity=[SupportFileFacts]::Identity($handle);
    can_read=$f.CanRead; closed=$handle.IsClosed; byte_range_locked=$locked }
  $value = [Console]::In.ReadLine()
  Emit @{ event='input_returned'; is_null=($null -eq $value); value=$value }
  if ($value -cne 'release-probe') { throw [IO.InvalidDataException]::new('release_input') }
} catch {
  Emit @{ event='helper_error'; type=$_.Exception.GetBaseException().GetType().FullName;
    hresult=$_.Exception.GetBaseException().HResult }
  exit 2
} finally {
  if ($null -ne $f) {
    try { if ($locked) { $f.Unlock(0, $f.Length); Emit @{ event='unlocked' } } }
    finally { $f.Dispose(); Emit @{ event='disposed'; closed=$handle.IsClosed } }
  }
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
    let fdRead;
    try {
      const bytes = fs.readFileSync(fd); // Uploader-equivalent data read through the opened handle.
      fdRead = { denied: false, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    } catch (error) { fdRead = { denied: true, code: error.code, errno: error.errno, syscall: error.syscall }; }
    return { denied: false, dev: String(st.dev), ino: String(st.ino), bytes: Number(st.size), fd_read: fdRead };
  } catch (error) {
    return { denied: true, code: error.code, errno: error.errno, syscall: error.syscall };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

async function observe(result, script, file, identity) {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  result.script_sha256 = createHash('sha256').update(script).digest('hex');
  result.events = [];
  const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, LC_HOLD_FILE: file, LC_PROBE_PARENT_PID: String(process.pid) },
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
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
    result.held_received = await bounded(held, 30000, 'readiness including installed Add-Type compiler');
    const heldEvent = result.events.find(event => event.event === 'held');
    const sameFile = other => other?.dev === identity.dev && other?.ino === identity.ino;
    result.held_identity_matches = sameFile(heldEvent?.identity);
    result.after_ready = { process: snapshot(), open: openAttempt(file), read: readAttempt(file) };
    if (heldEvent?.path) {
      result.helper_path = { path: heldEvent.path, open: openAttempt(heldEvent.path), read: readAttempt(heldEvent.path) };
    }
    // One delayed observation, not a readiness/polling loop. No input sent yet.
    await delay(150);
    result.after_150ms = { process: snapshot(), open: openAttempt(file), read: readAttempt(file) };
    result.open_identities_match = [result.after_ready.open, result.after_150ms.open, result.helper_path?.open]
      .filter(open => open && !open.denied).every(sameFile);
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
    result.byte_range_precondition_passed = result.name === 'byte-range' && result.held_identity_matches
      && result.open_identities_match && result.after_release.sha256 === identity.sha256
      && [result.after_ready, result.after_150ms, result.helper_path].every(observation =>
        observation?.open.denied === false && observation.open.fd_read?.code === 'EBUSY'
        && observation.read.code === 'EBUSY');
    result.duration_ms = elapsed();
  }
  return result;
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-support-share-'));
const file = path.join(directory, 'synthetic-original.txt');
const report = {
  scope: 'Synthetic held-file identity/native access/byte-range diagnostic; no uploader, privilege changes or GUI',
  date_utc: new Date().toISOString(), source,
  probe_sha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  parent: { node: process.version, uv: process.versions.uv, platform: process.platform,
    executable: process.execPath, os_release: os.release(), cwd: process.cwd() },
  results: [],
};
try {
  fs.writeFileSync(file, 'Synthetic support lock probe only.\n', { flag: 'wx' });
  const st = fs.statSync(file, { bigint: true });
  report.target = { path: file, realpath: fs.realpathSync(file), dev: String(st.dev), ino: String(st.ino),
    bytes: Number(st.size), sha256: readAttempt(file).sha256 };
  for (const [name, script] of [['identity-share-none', traced(false)], ['byte-range', traced(true)]]) {
    const result = { name };
    report.results.push(result); // Preserve this arm even if its cleanup cannot be confirmed.
    await observe(result, script, file, report.target);
    if (result.cleanup_error) break; // No more children after an unconfirmed cleanup.
  }
} catch (error) {
  report.error = error.message;
} finally {
  try { fs.rmSync(directory, { recursive: true }); report.own_temp_removed = true; }
  catch (error) { report.cleanup_error = error.code; }
  report.observation_complete = report.results.length === 2 && report.results.every(r => r.completed) && report.own_temp_removed === true;
  report.identity_checks_passed = report.observation_complete && report.results.every(r => r.held_identity_matches && r.open_identities_match);
  report.byte_range_precondition_passed = report.observation_complete && report.results.find(r => r.name === 'byte-range')?.byte_range_precondition_passed === true;
  report.normal_release_passed = report.observation_complete && report.results.every(r => r.normal_release_passed);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.identity_checks_passed && report.byte_range_precondition_passed && report.normal_release_passed ? 0 : 1;
}
