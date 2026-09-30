// The one foreground local host this main process runs: the released services.api.desktop_local, as a private child.
// Main alone writes its one startup record to the child's input, the only place the token and database DSN ever go
// (never argv, environment, files or logs); reads its one READY line; waits, without resending anything, until its
// loopback port answers; and ends it by closing its input (end of file). Only if it has not ended in time is this
// child alone killed; for the WSL development route that kills the wsl.exe shim, which is not proof that the Linux
// host ended, and is reported as such. Nothing the child writes is logged; only its fixed error codes are read.
import { spawn as spawnChild, spawnSync, type ChildProcess } from 'node:child_process';
import { closeSync, constants, mkdtempSync, openSync, rmdirSync, unlinkSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loopbackTransport, errorCode, type Transport } from './loopback-http.ts';

/** How the host is started (explicit trusted development inputs; see capture-link.ts). */
export type HostLaunch =
  /** Windows: through wsl.exe into the WSL distribution that holds the Backend and its test database. */
  | { readonly kind: 'wsl'; readonly distribution: string; readonly user: string; readonly cd: string; readonly python: string }
  /**
   * POSIX (development checks): the Backend's python in `cwd`, its input a private FIFO (the host requires a pipe).
   * `module` is for tests only (a wrapper that runs the released host's own main with an in-memory store).
   */
  | { readonly kind: 'fifo'; readonly python: string; readonly cwd: string; readonly module?: string };

export const STARTUP_FORMAT = 'lc-desktop-capture-host-v1';
const READY_FORMAT = 'lc-desktop-capture-host-ready-v1';
const ERROR_FORMAT = 'lc-desktop-capture-host-error-v1';
const HOST_ERRORS = ['invalid_startup', 'startup_timeout', 'unexpected_input', 'parent_input_lost', 'unavailable', 'shutdown_timeout'] as const;
export type HostError = (typeof HOST_ERRORS)[number];

/** The startup record, exactly as the released host takes it. */
export type StartupRecord = {
  readonly format: typeof STARTUP_FORMAT;
  readonly port: 0;
  readonly database_dsn: string;
  readonly user_id: string;
  readonly device_id: string;
  readonly session_id: string;
  readonly producer_id: string;
  readonly registration: unknown;
  readonly token: string;
  readonly expires_at: string;
  readonly scopes: readonly string[];
  readonly capabilities: readonly string[];
  readonly fresh_consent: boolean;
  readonly producer_profile: 'desktop_pixels';
  readonly enable_raw_ingress: false;
  readonly enable_desktop_ingress: false;
  readonly enable_windows_ingress: true;
  readonly enable_macos_ingress: false;
};

export type HostExit = { readonly code: number | null; readonly signal: string | null; readonly error: HostError | null };
export type Host = {
  readonly origin: string;
  readonly start_status: 'pending' | 'consumed';
  /** The process this app started (for WSL, the wsl.exe shim). */
  readonly pid: number | undefined;
  /** Settles when this child has exited (with its fixed error code, if it wrote one). */
  readonly exited: Promise<HostExit>;
  /**
   * Ends the host: end of input, then a bounded wait; then this child alone is killed. `ended` is true only when the
   * host itself was seen to end (for the WSL route: wsl.exe exited on its own after the end of input).
   */
  end(): Promise<{ ended: boolean; exit: HostExit | null; note: string }>;
};
export type HostStart =
  | { readonly ok: true; readonly host: Host }
  /** No READY: a grant may still have been committed (the host cannot say); nothing else is known. */
  /**
   * `delivered`: the startup record was handed to a started host (only then can a grant exist). `start_status`: what
   * its READY said, when it said it (the port may then still not have been reached).
   */
  | { readonly ok: false; readonly reason: string; readonly exit: HostExit | null; readonly delivered: boolean; readonly start_status?: 'pending' | 'consumed' };

export type HostOptions = {
  /** READY must come within this long (the host's own startup bound is 10 s). */
  readonly ready_ms?: number;
  /** The loopback port must answer within this long after READY (WSL forwards it a little later). */
  readonly reach_ms?: number;
  /** After the end of input, the host must exit within this long (its own shutdown bound is 5 s). */
  readonly end_ms?: number;
  readonly transport?: Transport;
  /** For tests: how the child is spawned. */
  readonly spawn?: typeof spawnChild;
};

/**
 * The environment of the child: nothing of this app's configuration, and no libpq setting (PGHOSTADDR, PGSERVICE,
 * PGHOST and the rest could send the host to another database than the checked DSN names).
 */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(LC_|WSLENV$|PYTHON|PG)/i.test(k)) env[k] = v;
  env['PYTHONDONTWRITEBYTECODE'] = '1';
  return env;
}

/** Why a READY line is not the released host's READY, or null. */
function readyProblem(line: string): { origin: string; start_status: 'pending' | 'consumed' } | string {
  if (Buffer.byteLength(line) > 4096) return 'the READY line is too long';
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return 'the READY line is not JSON';
  }
  const r = v as Record<string, unknown>;
  if (typeof v !== 'object' || v === null || Array.isArray(v) || Object.keys(r).sort().join() !== 'format,origin,start_status,status') return 'the READY line is not the host\'s';
  if (r['format'] !== READY_FORMAT || r['status'] !== 'ready' || (r['start_status'] !== 'pending' && r['start_status'] !== 'consumed')) return 'the READY line is not the host\'s';
  const m = typeof r['origin'] === 'string' ? /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(r['origin']) : null;
  const port = m ? Number(m[1]) : 0;
  if (!m || port > 65535 || port === 4173 || port === 8174) return 'the READY origin is not a loopback port this app may use';
  return { origin: r['origin'] as string, start_status: r['start_status'] as 'pending' | 'consumed' };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Starts the host with `record` and waits for it to be ready and reachable. */
export async function startHost(launch: HostLaunch, record: StartupRecord, options: HostOptions = {}): Promise<HostStart> {
  const readyMs = options.ready_ms ?? 15_000;
  const reachMs = options.reach_ms ?? 5_000;
  const endMs = options.end_ms ?? 8_000;
  const transport = options.transport ?? loopbackTransport;
  const spawn = options.spawn ?? spawnChild;
  const text = `${JSON.stringify(record)}\n`;
  if (Buffer.byteLength(text) > 65536) return { ok: false, reason: 'the startup record is too long', exit: null, delivered: false };

  let child: ChildProcess;
  let fifo: { dir: string; path: string; fd: number | null } | null = null;
  try {
    if (launch.kind === 'wsl') {
      child = spawn('wsl.exe', ['--distribution', launch.distribution, '--user', launch.user, '--cd', launch.cd, '--exec', launch.python, '-m', 'services.api.desktop_local'], { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv(), windowsHide: true });
    } else {
      const dir = mkdtempSync(join(tmpdir(), 'lc-host-'));
      const path = join(dir, 'input');
      if (spawnSync('mkfifo', ['-m', '600', path]).status !== 0) {
        rmdirSync(dir);
        return { ok: false, reason: 'the private input pipe could not be made', exit: null, delivered: false };
      }
      fifo = { dir, path, fd: null };
      // sh only redirects the FIFO and replaces itself with python: the host's argv is exactly python -m module.
      child = spawn('/bin/sh', ['-c', 'exec "$0" -m "$2" < "$1"', launch.python, path, launch.module ?? 'services.api.desktop_local'], { cwd: launch.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv() });
    }
  } catch {
    return { ok: false, reason: 'the host could not be started', exit: null, delivered: false };
  }

  let stderr = Buffer.alloc(0);
  child.stderr?.on('data', (c: Buffer) => {
    if (stderr.length < 4096) stderr = Buffer.concat([stderr, c]).subarray(0, 4096);
  });
  const exited = new Promise<HostExit>((resolve) => {
    child.once('exit', (code, signal) => {
      let error: HostError | null = null;
      try {
        const v = JSON.parse(stderr.toString('utf8').split('\n')[0] ?? '') as Record<string, unknown>;
        if (Object.keys(v).sort().join() === 'error,format' && v['format'] === ERROR_FORMAT && (HOST_ERRORS as readonly string[]).includes(v['error'] as string)) error = v['error'] as HostError;
      } catch {
        error = null;
      }
      resolve({ code, signal, error });
    });
    child.once('error', () => resolve({ code: null, signal: null, error: null }));
  });
  let exit: HostExit | null = null;
  void exited.then((e) => void (exit = e));

  // The one record, and the input kept open for the host's life.
  const closeInput = (): void => {
    if (fifo) {
      if (fifo.fd !== null) closeSync(fifo.fd);
      fifo.fd = null;
    } else {
      child.stdin?.end();
    }
  };
  const cleanupFifo = (): void => {
    if (!fifo) return;
    try {
      unlinkSync(fifo.path);
    } catch {
      // already gone
    }
    try {
      rmdirSync(fifo.dir);
    } catch {
      // already gone
    }
  };
  /** The one end of this child, whichever path asks for it first. */
  let ending: Promise<{ ended: boolean; exit: HostExit | null; note: string }> | null = null;
  const end = (): Promise<{ ended: boolean; exit: HostExit | null; note: string }> => (ending ??= endChild(child, closeInput, exited, endMs, launch.kind));
  let delivered = false;
  const deadline = Date.now() + readyMs;
  try {
    if (fifo) {
      // Opened without blocking once the host's shell has opened it for reading; then written whole.
      while (fifo.fd === null) {
        try {
          fifo.fd = openSync(fifo.path, constants.O_WRONLY | constants.O_NONBLOCK);
        } catch (error) {
          if (errorCode(error) !== 'ENXIO' || exit || Date.now() > deadline) throw error;
          await sleep(20);
        }
      }
      cleanupFifo();
      const bytes = Buffer.from(text, 'utf8');
      for (let at = 0; at < bytes.length; ) {
        try {
          at += writeSync(fifo.fd, bytes, at, bytes.length - at);
        } catch (error) {
          if (errorCode(error) !== 'EAGAIN' || Date.now() > deadline) throw error;
          await sleep(5);
        }
      }
    } else {
      child.stdin!.write(text);
    }
    delivered = true;
  } catch {
    cleanupFifo();
    const ended = await end();
    return { ok: false, reason: 'the startup record could not be given to the host', exit: ended.exit, delivered };
  }

  let onReady: ((c: Buffer) => void) | null = null;
  const ready = await new Promise<{ origin: string; start_status: 'pending' | 'consumed' } | string>((resolve) => {
    let out = '';
    const timer = setTimeout(() => resolve('no READY in time'), Math.max(0, deadline - Date.now()));
    onReady = (c: Buffer) => {
      if (out.length + c.length > 8192) return resolve('the host wrote more than its READY line'); // nothing more is kept
      out += c.toString('utf8');
      const nl = out.indexOf('\n');
      if (nl < 0) return;
      clearTimeout(timer);
      if (nl !== out.length - 1) return resolve('the host wrote more than its READY line');
      resolve(readyProblem(out.slice(0, nl)));
    };
    child.stdout?.on('data', onReady);
    void exited.then(() => {
      clearTimeout(timer);
      resolve('the host ended without READY');
    });
  });
  if (onReady) child.stdout?.off('data', onReady);
  if (typeof ready === 'string') {
    const ended = await end();
    const code = ended.exit?.error ? ` (${ended.exit.error})` : '';
    return { ok: false, reason: `${ready}${code}`, exit: ended.exit, delivered };
  }
  // Anything more on stdout breaks the protocol: the host is ended (and what it wrote is not kept).
  child.stdout?.on('data', () => void end());

  // Reachable: a side-effect-free GET until the port answers (a refused connection sent nothing). Never a resend.
  const reachBy = Date.now() + reachMs;
  for (;;) {
    if (exit) {
      await end(); // its input is closed too
      return { ok: false, reason: 'the host ended after READY', exit, delivered, start_status: ready.start_status };
    }
    try {
      const answer = await transport({ method: 'GET', url: `${ready.origin}/openapi.json`, headers: {}, body: null, timeout_ms: 2_000 });
      if (answer.status === 404) break;
      const ended = await end();
      return { ok: false, reason: `the host's port answered ${answer.status}, not as the host`, exit: ended.exit, delivered, start_status: ready.start_status };
    } catch (error) {
      if (errorCode(error) !== 'ECONNREFUSED' || Date.now() > reachBy) {
        const ended = await end();
        return { ok: false, reason: 'the host\'s port could not be reached', exit: ended.exit, delivered, start_status: ready.start_status };
      }
      await sleep(50);
    }
  }
  return {
    ok: true,
    host: { origin: ready.origin, start_status: ready.start_status, pid: child.pid, exited, end },
  };
}

/** End of input, a bounded wait, then this child alone is killed; says whether the host itself was seen to end. */
async function endChild(child: ChildProcess, closeInput: () => void, exited: Promise<HostExit>, endMs: number, kind: HostLaunch['kind']): Promise<{ ended: boolean; exit: HostExit | null; note: string }> {
  try {
    closeInput();
  } catch {
    // the input is already closed
  }
  const within = (ms: number): Promise<HostExit | null> => Promise.race([exited, sleep(ms).then(() => null)]);
  const exit = await within(endMs);
  if (exit) return { ended: true, exit, note: exit.error ? `the host ended (${exit.error})` : 'the host ended' };
  try {
    child.kill();
  } catch {
    // already gone
  }
  const killed = await within(2_000);
  return {
    ended: false,
    exit: killed,
    note: kind === 'wsl'
      ? 'the host did not end at the end of its input; the wsl.exe shim was ended, which does not show that the host process in WSL ended'
      : killed ? 'the host did not end at the end of its input and was killed' : 'the host did not end at the end of its input, nor when killed',
  };
}
