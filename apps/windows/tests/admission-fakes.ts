// A stand-in for a test's source checker (QA's native admission), for tests. SYNTHETIC: no Windows, no display, no
// browser and no native check are involved; it speaks lc-source-admission/1 over in-process streams and answers what
// a test tells it to (allow by default).
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';

export type Request = Record<string, unknown> & { id: string; seq: number; phase: string };
/** Every member an answer echoes (every member of the request but `sent_at`). */
export const ECHO = ['format', 'id', 'seq', 'phase', 'capture_id', 'display', 'overlay', 'sample_seq', 'frame_seq', 'raw_sha256', 'raw_size', 'request_id', 'image_sha256'] as const;
export const echo = (r: Request): Record<string, unknown> => Object.fromEntries(ECHO.map((k) => [k, r[k]]));

export class FakeChecker extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly pid = 6_000_000 + Math.floor(Math.random() * 1000);
  /** Every request received, in order. */
  readonly requests: Request[] = [];
  /** How it answers: 'allow' and 'deny' at once; 'hold': a test answers (`reply`, `write`). */
  mode: 'allow' | 'deny' | 'hold' = 'allow';
  /** Answers only requests of these phases by itself; the others are held for the test. */
  holdPhases = new Set<string>();
  /** Whether it writes its ready line at once when started (a test may write it, or something else, itself). */
  autoReady = true;
  /** It does not end at the end of its input (only a kill ends it). */
  ignoresEnd = false;
  exited = false;
  kills = 0;
  inputEnded = false;
  spawned: { command: string; args: string[]; options: Record<string, unknown> } | null = null;
  private buffer = '';
  constructor() {
    super();
    this.stdin.on('data', (c: Buffer) => {
      this.buffer += c.toString('utf8');
      for (let nl = this.buffer.indexOf('\n'); nl >= 0; nl = this.buffer.indexOf('\n')) {
        const line = this.buffer.slice(0, nl);
        this.buffer = this.buffer.slice(nl + 1);
        const r = JSON.parse(line) as Request;
        this.requests.push(r);
        this.emit('request', r);
        if (this.mode !== 'hold' && !this.holdPhases.has(r.phase)) this.reply(r, { verdict: this.mode });
      }
    });
    this.stdin.on('finish', () => {
      this.inputEnded = true;
      if (!this.ignoresEnd) setImmediate(() => this.exit(0));
    });
    setImmediate(() => {
      if (this.autoReady && !this.exited) this.write(JSON.stringify({ format: 'lc-source-admission/1', ready: true }));
    });
  }
  /** Answers a request: its echo, `allow` and no reason, with `over` applied. */
  reply(r: Request, over: Record<string, unknown> = {}): void {
    this.write(JSON.stringify({ ...echo(r), verdict: 'allow', reason: null, ...over }));
  }
  /** Writes a line as it is (a test's malformed answer included). */
  write(line: string): void {
    if (!this.exited) this.stdout.write(`${line}\n`);
  }
  /** The requests of a phase. */
  of(phase: string): Request[] {
    return this.requests.filter((r) => r.phase === phase);
  }
  /** The request waiting for a held answer (the newest). */
  waiting(): Request {
    return this.requests.at(-1)!;
  }
  exit(code: number | null = 0, signal: string | null = null): void {
    if (this.exited) return;
    this.exited = true;
    this.stdout.end();
    this.emit('exit', code, signal);
  }
  kill(): boolean {
    this.kills += 1;
    this.exit(null, 'SIGTERM');
    return true;
  }
}

/** A spawn that makes stand-in checkers (`configure` sets each one up as it is made). */
export function fakeCheckers(configure: (c: FakeChecker) => void = () => undefined) {
  const made: FakeChecker[] = [];
  const spawnFake = ((command: string, args: string[], options: Record<string, unknown>) => {
    const c = new FakeChecker();
    c.spawned = { command, args, options };
    configure(c);
    made.push(c);
    return c;
  }) as unknown as typeof spawn;
  return { made, spawn: spawnFake, last: (): FakeChecker => made.at(-1)! };
}

const dirs: string[] = [];
process.on('exit', () => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});
/** A trusted configuration file as a runner writes it (`over` replaces members), and its path for LC_SOURCE_ADMISSION. */
export function admissionConfig(over: Record<string, unknown> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-admission-'));
  dirs.push(dir);
  const file = path.join(dir, 'source-admission.json');
  const config = { format: 'lc-windows-source-admission-config/v1', checker: { command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: ['-NoProfile', '-File', 'C:\\qa\\checker.ps1'] }, ready_ms: 10000, decision_ms: 5000, ...over };
  fs.writeFileSync(file, JSON.stringify(config));
  return file;
}
