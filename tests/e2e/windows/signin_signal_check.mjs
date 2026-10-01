// node tests/e2e/windows/signin_signal_check.mjs   (WSL2 on a Windows host; run from /mnt/c)
// Headless validation of what signin_cleanup.mjs says about Windows. No app, no window, no display, no sign-in.
//   1. argv() gives the same arguments as Windows' own CommandLineToArgvW for a list of command lines (parse only).
//   2. The look command runs and is read.
//   3. The signal command, against a windowless process that this script starts itself (a PowerShell sleeper with its
//      own tag): it signals only the exact identity it is given (PID + creation time + executable + command line,
//      character for character) and answers stale / unverified / gone otherwise, leaving the process alone.
import { execFileSync, spawn } from 'node:child_process';
import { argv, lookCommand, readLook, signalCommand } from './signin_cleanup.mjs';

const ps = (command) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { cwd: '/mnt/c', encoding: 'utf8', timeout: 60000 });
const out = {};

// ---- 1. argv() against CommandLineToArgvW
const E = 'C:\\T\\e.exe', S = 'C:\\T\\stage';
const lines = [
  `"${E}" "${S}" --remote-debugging-port=43000 --remote-debugging-address=127.0.0.1`, `electron.exe ${S}\\qa-check.js --qa-check-port=43000`,
  `"${E}" "${S}""" --p=1 --q`, `e.exe "--qa-check-port=43000"""`, `"${E}\\" "${S}" a b`, `e.exe a\\"b "" c`, `e.exe "a b" c\\\\ d\\\\"e f"`, `e.exe \\\\\\"x`, `e.exe "x\\\\\\\\" y`,
  `"C:\\d\\\\" a`, `e.exe   a\t b  `, `e.exe ""`, `e.exe """"`, `e.exe "a""b" c`, `e.exe a""b c`, `e.exe "a "" b"`, `"e x.exe" a`, `e.exe "unterminated arg`, `e.exe a\\ b\\\\ c`, `e.exe "C:\\a b\\" c`,
  `e.exe --type=renderer`, `"e.exe"a b`, `e.exe "" "" x`, `e.exe \\"`, `e.exe "\\\\"`, `e.exe a"b c"d`, `e.exe 'single quoted' x`, `  e.exe a`, `e.exe`, `"e.exe`,
];
const windows = JSON.parse(Buffer.from(ps(`$ErrorActionPreference='Stop'; Add-Type -Namespace Q -Name N -MemberDefinition '[DllImport("shell32.dll", SetLastError=true)] public static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)] string l, out int n); [DllImport("kernel32.dll")] public static extern IntPtr LocalFree(IntPtr h);'; `
  + `$in = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(JSON.stringify(lines), 'utf8').toString('base64')}')) | ConvertFrom-Json; `
  + `$all = @(foreach ($l in $in) { $n = 0; $p = [Q.N]::CommandLineToArgvW($l, [ref]$n); $a = @(for ($i = 0; $i -lt $n; $i++) { [Runtime.InteropServices.Marshal]::PtrToStringUni([Runtime.InteropServices.Marshal]::ReadIntPtr($p, $i * [IntPtr]::Size)) }); [void][Q.N]::LocalFree($p); ,@($a) }); `
  + `[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Compress -Depth 4 @{ r = $all })))`).trim().split(/\r?\n/).at(-1), 'base64').toString('utf8')).r;
const differing = lines.map((line, i) => ({ line, mine: argv(line), windows: [].concat(windows[i] ?? []) })).filter((x) => JSON.stringify(x.mine) !== JSON.stringify(x.windows));
out.argv_against_CommandLineToArgvW = { command_lines: lines.length, equal: lines.length - differing.length, differing };

// ---- 2. the look, for a port nobody uses
const empty = readLook(ps(lookCommand(44990)));
out.look_electron_free_port = { processes: empty.processes.length, listen: empty.listen, now_is_ticks: /^\d{18}$/.test(empty.now) };

// ---- 3. the signal, against this script's own windowless sleeper
const sig = (identity, how) => ps(signalCommand(identity, how)).trim().split(/\r?\n/).at(-1);
const tag = `qa-signal-test-${Date.now()}`;
const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Sleep -Seconds 120 # ${tag}`], { cwd: '/mnt/c', stdio: 'ignore' });
await new Promise((ok) => setTimeout(ok, 2500));
const find = () => readLook(ps(lookCommand(44990, 'powershell.exe'))).processes.filter((p) => p.command_line && p.command_line.includes(tag) && !p.command_line.includes('Get-CimInstance'));
try {
  const mine = find();
  out.sleeper_found = mine.length;
  const me = mine[0];
  out.identity = { pid_is_number: Number.isInteger(me.pid), created_is_ticks: /^\d{18}$/.test(me.created), exe_ends: me.exe.split('\\').at(-1), command_line_has_tag: me.command_line.includes(tag) };
  out.wrong_creation = sig({ ...me, created: String(BigInt(me.created) + 10n) }, 'force');
  out.alive_after_wrong_creation = find().length;
  out.wrong_command_line = sig({ ...me, command_line: `${me.command_line} x` }, 'force');
  out.command_line_with_an_invisible_character = sig({ ...me, command_line: `${me.command_line.slice(0, 5)}\u00ad${me.command_line.slice(5)}` }, 'force');   // a soft hyphen: equal to a linguistic compare, not to an exact one
  out.wrong_executable = sig({ ...me, exe: `${me.exe}x` }, 'force');
  out.executable_in_other_letter_case = sig({ ...me, exe: me.exe.toLowerCase() === me.exe ? me.exe.toUpperCase() : me.exe.toLowerCase() }, 'force');
  out.alive_after_wrong_launch = find().length;
  out.close_request = sig(me, 'close');
  out.alive_after_close_request = find().length;
  out.force_exact_identity = sig(me, 'force');
  await new Promise((ok) => setTimeout(ok, 1500));
  out.alive_after_force = find().length;
  out.again = sig(me, 'force');
  out.no_such_pid = sig({ ...me, pid: 4194000 }, 'force');
} finally {
  try { child.kill(); } catch { /* it is gone */ }
}
console.log(JSON.stringify(out, null, 1));
