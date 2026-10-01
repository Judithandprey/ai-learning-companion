// What `signin_launcher.mjs check` owns, and how it lets go of it. No Windows call is made in this file: the caller
// gives the functions that look and signal, so the whole rule is tested without a display.
//
// OWNED means an exact launch identity, not a number and not a piece of text:
//   - the executable is exactly the staged Electron runtime;
//   - the arguments are exactly the ones this check launched: for the app `<staged app> --remote-debugging-port=<port>
//     --remote-debugging-address=127.0.0.1`, for the checker `<check folder>\qa-check.js --qa-check-port=<port>`
//     (whole arguments are compared, so port 43000 is not found inside 430009);
//   - it was created after this check began.
// A process once seen as owned is remembered by (PID, creation time). A later look must find that same pair with the
// same launch identity; a PID alone is never trusted, because Windows hands PIDs out again.
//
// The rule:
//   - a signal is sent only to an identity that is owned at that look, and the caller's `signal` validates the identity
//     again while it holds the process (`signalCommand`, run through `windowsCalls`). A close request comes first, force only after it;
//   - if a remembered process is still there but can no longer be shown to be the same launch (its command line cannot
//     be read, or differs), or a new process of the same runtime cannot be told apart, ownership is UNKNOWN: nothing more
//     is signalled, nothing is removed, and that is what is reported;
//   - the folder is removed only if this check made it, every remembered identity is confirmed gone, nothing owned or
//     unresolved is left, and nothing that is not owned holds the check's port;
//   - when a look fails, nothing more is signalled and nothing is removed.
//
// The cleanup reads the COMPLETE look: every process of the runtime's image name, child processes included. A remembered
// process that later shows another command line (a `--type=` one too) is then still found by its PID and creation time,
// and is "not revalidated", never "gone". Leaving child processes out is for the caller's question before anything is
// started (`launches`), and for the report (`children`); it is never done to what `releaseOwned` looks at.

/**
 * A Windows command line as its arguments, by the rules of CommandLineToArgvW: the program name is taken up to its
 * closing quote (or the first blank) with backslashes plain; after it, 2n backslashes before a quote are n backslashes,
 * 2n+1 are n backslashes and a literal quote, and a doubled quote inside quotes is one literal quote that ends the
 * quoted part.
 */
export function argv(commandLine) {
  const out = [];
  let i = 0;
  if (commandLine.length === 0) return out;
  if (commandLine[0] === '"') { const end = commandLine.indexOf('"', 1); out.push(commandLine.slice(1, end < 0 ? commandLine.length : end)); i = end < 0 ? commandLine.length : end + 1; }
  else { while (i < commandLine.length && commandLine[i] !== ' ' && commandLine[i] !== '\t') i += 1; out.push(commandLine.slice(0, i)); }
  let cur = '', quoted = false, has = false;
  while (i < commandLine.length) {
    const c = commandLine[i];
    if (c === '\\') {
      let n = 0;
      while (commandLine[i] === '\\') { n += 1; i += 1; }
      if (commandLine[i] === '"') { cur += '\\'.repeat(Math.floor(n / 2)); if (n % 2) { cur += '"'; i += 1; } } else cur += '\\'.repeat(n);
      has = true;
    } else if (c === '"') {
      if (quoted && commandLine[i + 1] === '"') { cur += '"'; i += 1; }
      quoted = !quoted; has = true; i += 1;
    } else if (!quoted && (c === ' ' || c === '\t')) { if (has) { out.push(cur); cur = ''; has = false; } i += 1; }
    else { cur += c; has = true; i += 1; }
  }
  if (has) out.push(cur);
  return out;
}

const samePath = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const readable = (v) => typeof v === 'string' && v.length > 0;
const after = (created, notBefore) => { try { return BigInt(created) >= BigInt(notBefore); } catch { return false; } };
export const key = (p) => `${p.pid}:${p.created}`;
/** A readable command line with a `--type=` argument: a child process of some Electron app, never an app's own launch. */
export const isChild = (p) => readable(p.command_line) && argv(p.command_line).slice(1).some((a) => a.startsWith('--type='));
/**
 * The processes of a look that are not plainly child processes. Only for the question "is an Electron app open?" before
 * anything is started. Never give its result to `releaseOwned`: a remembered process would be hidden from it.
 * A child process whose creation time cannot be read is kept: the cleanup could not tell it apart later, so the check
 * must not start beside it.
 */
export const launches = (processes) => processes.filter((p) => !(isChild(p) && readable(p.created)));

/**
 * What one process is to this check.
 *   'app' | 'checker'  exactly one of this check's two launches
 *   'unresolved'       it cannot be told: it was created after the check began (or its creation time cannot be read)
 *                      and its command line or executable cannot be read, or it carries one of this check's exact port
 *                      arguments in another launch
 *   'foreign'          readable and not this check's (never signalled; reported)
 * @param {{ pid: number, created: string, exe: string|null, command_line: string|null }} p
 * @param {{ exe: string, app: string[], checker: string[], markers: string[], notBefore: string }} expected
 */
export function ownedKind(p, expected) {
  if (!readable(p.created)) return 'unresolved';                                // no creation time: it cannot be told
  const young = after(p.created, expected.notBefore);
  if (!readable(p.command_line)) return young ? 'unresolved' : 'foreign';   // made since the check began and not readable: it could be this check's
  if (isChild(p)) return 'foreign';                                         // a child of some Electron app, never a launch of ours (whatever its path)
  if (!readable(p.exe)) return young ? 'unresolved' : 'foreign';
  const args = argv(p.command_line).slice(1);
  const is = (want) => args.length === want.length && samePath(args[0], want[0]) && want.slice(1).every((a, i) => args[i + 1] === a);
  if (young && samePath(p.exe, expected.exe)) { if (is(expected.app)) return 'app'; if (is(expected.checker)) return 'checker'; }
  return args.some((a) => expected.markers.includes(a)) ? 'unresolved' : 'foreign';
}

/**
 * @param {object} d
 * @param {() => Promise<{ processes: Array<{pid:number,created:string,exe:string|null,command_line:string|null}>, listen: number[] }>} d.look
 *        EVERY process of the Electron runtime's image name (child processes too: nothing taken out), and the PIDs listening
 *        on the check's port. Throws when it cannot look.
 * @param {(identity: object, how: 'close'|'force') => Promise<'signalled'|'no_window'|'gone'|'stale'|'unverified'>} d.signal
 *        validates that exact identity again while holding the process, and only then signals it. 'stale': that PID is another
 *        process now (nothing was signalled). 'unverified': the same process, but its launch identity could not be shown again.
 * @param {object} d.expected   see ownedKind
 * @param {boolean} d.ownsFolder             this check made the folder itself
 * @param {() => Promise<boolean>} d.removeFolder   removes the folder; resolves to whether one was removed
 */
export async function releaseOwned({ look, signal, sleep, now = Date.now, expected, ownsFolder, removeFolder, waitSelfMs = 20000, waitCloseMs = 15000, waitForceMs = 10000, stepMs = 500 }) {
  const record = { owned_seen: [], asked_to_close: [], ended_by_force: [], signals: [], errors: [], exit: 'unknown', left_running: [], not_revalidated: [], unresolved: [], not_owned_on_the_port: [], foreign: [], children: [],
    folder: 'kept', folder_reason: null };
  const known = new Map();   // key -> the identity as it was first seen owned
  const say = (p) => ({ pid: p.pid, created: p.created });
  // One look, read against what is remembered. null: the look failed.
  const see = async () => {
    let snap;
    try {
      snap = await look();
      if (!Array.isArray(snap?.processes) || !Array.isArray(snap?.listen)) throw new Error('unreadable answer');
    } catch (error) { record.errors.push(`look: ${String(error?.message ?? error).slice(0, 200)}`); return null; }
    const state = { owned: [], notRevalidated: [], unresolved: [], foreign: [], children: [], others: [] };
    for (const p of snap.processes) {
      const kind = ownedKind(p, expected);
      if (kind === 'app' || kind === 'checker') {
        if (!known.has(key(p))) { known.set(key(p), { ...p, kind }); record.owned_seen.push({ ...say(p), kind }); }
        state.owned.push(known.get(key(p)));
      } else if (known.has(key(p))) state.notRevalidated.push(known.get(key(p)));   // the same process, no longer shown to be the same launch
      else if (kind === 'unresolved') state.unresolved.push(say(p));
      else if (isChild(p)) state.children.push(p.pid);                              // never remembered, so never this check's launch: reported apart
      else state.foreign.push(p.pid);
    }
    const ownedPids = new Set(state.owned.map((p) => p.pid));
    state.others = snap.listen.filter((pid) => !ownedPids.has(pid));
    state.sure = state.notRevalidated.length === 0 && state.unresolved.length === 0;
    return state;
  };
  // Looks until nothing owned or doubtful is left, or the time is over. While ownership is not sure it only keeps looking
  // (a process caught while it exits can be unreadable for a moment); nothing is signalled on an unsure look.
  const until = async (ms) => {
    const end = now() + ms;
    let state = await see();
    while (state && (!state.sure || state.owned.length > 0) && now() < end) { await sleep(stepMs); state = await see(); }
    return state;
  };
  // Signals each identity that is owned at this look. false: an identity could not be validated at the signal: stop.
  const each = async (identities, how, done) => {
    for (const identity of identities) {
      let answer;
      try { answer = await signal(identity, how); } catch (error) { record.errors.push(`${how} ${identity.pid}: ${String(error?.message ?? error).slice(0, 200)}`); continue; }
      record.signals.push({ ...say(identity), how, answer });
      if (answer === 'signalled') done.push(say(identity));
      if (answer === 'unverified') return false;
    }
    return true;
  };

  let state = await until(waitSelfMs);                                   // 1. it may end by itself (the check asked the window to close)
  let sure = Boolean(state?.sure);
  if (state && sure && state.owned.length > 0) { sure = await each(state.owned, 'close', record.asked_to_close); state = sure ? await until(waitCloseMs) : await see(); sure = sure && Boolean(state?.sure); }
  if (state && sure && state.owned.length > 0) { sure = await each(state.owned, 'force', record.ended_by_force); state = sure ? await until(waitForceMs) : await see(); sure = sure && Boolean(state?.sure); }
  if (state) {
    record.left_running = state.owned.map(say);
    record.not_revalidated = state.notRevalidated.map(say);
    record.unresolved = state.unresolved;
    record.not_owned_on_the_port = state.others;
    record.foreign = state.foreign;
    record.children = state.children;
    record.exit = !sure || !state.sure ? 'unknown' : state.owned.length === 0 && state.others.length === 0 ? 'confirmed' : 'still_running';
  }
  if (!ownsFolder) record.folder_reason = 'this check did not make the folder: it is not this check\'s to remove';
  else if (record.exit !== 'confirmed') record.folder_reason = `the exit of what this check started is ${record.exit === 'unknown' ? 'not known' : 'not confirmed (a process is still there)'}: the folder is kept as it is`;
  else {
    try { record.folder = (await removeFolder()) ? 'removed' : 'none_was_there'; } catch (error) { record.folder_reason = `the folder could not be removed: ${String(error?.message ?? error).slice(0, 200)}`; }
  }
  return record;
}

// ---- the two Windows commands, as text (PowerShell 5.1). They are built here and run by the caller ---------------------
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');

/**
 * The look: every process with that image name (PID, creation time in ticks, executable path, command line) and the PIDs
 * listening on the port, with the Windows clock, as one base64 line of UTF-8 JSON. It only reads.
 */
export function lookCommand(port, imageName = 'electron.exe') {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[A-Za-z0-9._-]+$/.test(imageName)) throw new Error('not a port or an image name');
  return `$ErrorActionPreference = 'Stop'; `
    + `$rows = @(Get-CimInstance Win32_Process -Filter "Name='${imageName}'" | ForEach-Object { @{ pid = [int]$_.ProcessId; created = $(if ($_.CreationDate) { [string]$_.CreationDate.ToUniversalTime().Ticks } else { $null }); exe = $_.ExecutablePath; command_line = $_.CommandLine } }); `
    + `$ev = $null; $listen = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue -ErrorVariable ev | ForEach-Object { [int]$_.OwningProcess } | Sort-Object -Unique); `
    + `if (@($ev | Where-Object { $_.CategoryInfo.Category -ne 'ObjectNotFound' }).Count -gt 0) { throw 'the listeners could not be read' }; `
    + `$json = ConvertTo-Json -Compress -Depth 4 @{ now = [string][DateTime]::UtcNow.Ticks; processes = $rows; listen = $listen }; `
    + `[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))`;
}

/** Reads the look's one line. Throws on anything it does not understand. */
export function readLook(output) {
  const out = JSON.parse(Buffer.from(output.trim().split(/\r?\n/).at(-1), 'base64').toString('utf8'));
  const text = (v) => (typeof v === 'string' && v.length > 0 ? v : null);
  const processes = [].concat(out.processes ?? []).map((p) => ({ pid: Number(p.pid), created: text(p.created), exe: text(p.exe), command_line: text(p.command_line) }));
  const listen = [].concat(out.listen ?? []).map(Number);
  if (!/^\d+$/.test(String(out.now)) || ![...processes.map((p) => p.pid), ...listen].every((n) => Number.isInteger(n) && n >= 0) || !processes.every((p) => p.created === null || /^\d+$/.test(p.created))) throw new Error('unreadable process list');
  return { now: String(out.now), processes, listen };
}

/**
 * The look and the signal as the launcher runs them, from its one way to run a Windows command (`ps`: the command's text
 * in, its output out). The look is the complete answer of `lookCommand`: nothing stands between it and `releaseOwned`.
 */
export function windowsCalls(ps, port) {
  const answers = ['signalled', 'no_window', 'gone', 'stale', 'unverified'];
  return {
    look: async () => readLook(ps(lookCommand(port))),
    // One exact identity, validated again by the command itself while it holds the process (signalCommand).
    signal: async (identity, how) => {
      const answer = ps(signalCommand(identity, how)).trim().split(/\r?\n/).at(-1);
      if (!answers.includes(answer)) throw new Error(`unreadable answer: ${String(answer).slice(0, 80)}`);
      return answer;
    },
  };
}

/**
 * The signal, bound to one exact identity. It first takes hold of the process with that PID: while it is held, Windows
 * cannot give the PID to another process. Then it reads that PID's creation time, executable and command line again and
 * compares them with the remembered ones, character for character. Only if all are the same does it ask the main window to
 * close, or end the
 * process, through the handle it holds. It prints one word:
 *   signalled | no_window (a close request found no window; nothing was sent) | gone | stale (the PID is another
 *   process now; nothing was sent) | unverified (the same process, but it could not be held or its launch differs)
 */
export function signalCommand(identity, how) {
  if (!Number.isInteger(identity?.pid) || identity.pid <= 0 || !/^\d+$/.test(String(identity.created)) || !readable(identity.exe) || !readable(identity.command_line) || !['close', 'force'].includes(how)) throw new Error('not an identity');   // (an empty text would equal an unreadable one in the command)
  return `$ErrorActionPreference = 'Stop'; `
    + `$exe = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(identity.exe)}')); $cl = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(identity.command_line)}')); `
    + `$p = $null; try { $p = [System.Diagnostics.Process]::GetProcessById(${identity.pid}); $null = $p.Handle } catch { $p = $null }; `
    + `$w = Get-CimInstance Win32_Process -Filter "ProcessId=${identity.pid}"; `
    + `if (-not $w) { 'gone'; exit 0 }; `
    + `if (-not $w.CreationDate) { 'unverified'; exit 0 }; `
    + `if (-not [string]::Equals([string]$w.CreationDate.ToUniversalTime().Ticks, '${identity.created}', [StringComparison]::Ordinal)) { 'stale'; exit 0 }; `
    + `if (-not $p) { 'unverified'; exit 0 }; `
    + `if (-not [string]::Equals($w.ExecutablePath, $exe, [StringComparison]::Ordinal) -or -not [string]::Equals($w.CommandLine, $cl, [StringComparison]::Ordinal)) { 'unverified'; exit 0 }; `
    + (how === 'close' ? `if ($p.CloseMainWindow()) { 'signalled' } else { 'no_window' }` : `$p.Kill(); 'signalled'`);
}
