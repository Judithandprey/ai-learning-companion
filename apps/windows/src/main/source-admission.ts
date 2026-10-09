// A test's source check (QA's native admission of the captured source), from this app's side. Test mode only.
//
// - Off unless the environment variable LC_SOURCE_ADMISSION names a trusted configuration file. Only this main process
//   reads it, once, when the app starts; no window can set or see it, and nothing a window sends, nothing on the
//   screen and no request chooses what is run, its arguments or a decision.
// - On: for each capture, one checker child (the program the configuration names, with its fixed arguments) is run
//   as a private foreground child of this main process and spoken to over its input and output, one JSON line each
//   way (lc-source-admission/1). Each decision is asked anew: before the capture's stream is armed, immediately
//   before and after each frame is taken from the stream, and immediately before each request is sent to ChatGPT.
// - Only "allow" lets the app go on. Anything else is a violation, latched for that capture: a denial; an answer that
//   is malformed, too long, not to the request that is waiting, given twice, or late; no ready line in time; the
//   checker's end. Every later decision is then refused here without asking. (main.ts ends the whole capture.)
// - One request is out at a time; a request is written only when the one before it is answered, and only if what it
//   is for still holds then. Its time and its bound start when it is written. The checks bracket a frame's grab and
//   precede a send; they are not atomic with them: the time between a check and what it guards remains.
// - `frame_seq` is always the overlay's own number of a frame it took from the stream (its sample's number then),
//   never the number an AI session gives the frames it is sent.
// - The child is ended with its capture: the end of its input, a bounded wait, then this child alone is killed (no
//   other process). Whether its end was seen is said; an end that was not seen is not said to be one.
import { spawn as spawnChild, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { childEnv } from './capture-host.ts';

export const ADMISSION_CONFIG_FORMAT = 'lc-windows-source-admission-config/v1';
export const ADMISSION_FORMAT = 'lc-source-admission/1';
/** Bytes of one line, either way (its newline not counted). */
export const ADMISSION_LINE_MAX = 4096;
export const READY_MS = { min: 1000, max: 120_000 };
export const DECISION_MS = { min: 100, max: 30_000 };
/** After the end of its input, the checker is given this long to end before it alone is killed. */
const END_MS = 3000;

// ---- configuration (trusted, main process only) ---------------------------------------------------------------
export type AdmissionConfig = { readonly command: string; readonly args: readonly string[]; readonly ready_ms: number; readonly decision_ms: number };
const isText = (v: unknown, max = 4096): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\0\r\n]/.test(v);
const sameKeys = (v: Record<string, unknown>, keys: string[]): boolean => Object.keys(v).sort().join() === [...keys].sort().join();
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const within = (v: unknown, b: { min: number; max: number }): v is number => Number.isSafeInteger(v) && (v as number) >= b.min && (v as number) <= b.max;
/** An absolute path: a drive's (C:\...) or, for a check on another system, a POSIX one. Never looked up on PATH. */
const isAbsolutePath = (v: string): boolean => /^[A-Za-z]:\\/.test(v) || v.startsWith('/');

/** The configuration named by LC_SOURCE_ADMISSION, or null when it is not set (no source check: the product as it is). */
export function readAdmissionConfig(env: Readonly<Record<string, string | undefined>>, read: (path: string) => string = (p) => readFileSync(p, 'utf8')): AdmissionConfig | { error: string } | null {
  const path = env['LC_SOURCE_ADMISSION'];
  if (path === undefined) return null;
  if (path === '') return { error: 'the source check configured for this test could not be read' }; // (set, but to nothing: not "off")
  let v: unknown;
  try {
    v = JSON.parse(read(path));
  } catch {
    return { error: 'the source check configured for this test could not be read' };
  }
  const bad = { error: 'the source check configured for this test is not valid' };
  if (!isObj(v) || !sameKeys(v, ['format', 'checker', 'ready_ms', 'decision_ms']) || v['format'] !== ADMISSION_CONFIG_FORMAT) return bad;
  const c = v['checker'];
  if (!isObj(c) || !sameKeys(c, ['command', 'args']) || !isText(c['command']) || !isAbsolutePath(c['command'])) return bad;
  const args = c['args'];
  if (!Array.isArray(args) || args.length > 32 || !args.every((a) => isText(a))) return bad;
  if (!within(v['ready_ms'], READY_MS) || !within(v['decision_ms'], DECISION_MS)) return bad;
  return { command: c['command'], args: [...(args as string[])], ready_ms: v['ready_ms'], decision_ms: v['decision_ms'] };
}

// ---- one decision ----------------------------------------------------------------------------------------------
export type AdmissionPhase = 'arm' | 'pre_acquire' | 'post_acquire' | 'send';
/** What a decision is asked about. Each field that does not apply is null. */
export type AdmissionAsk = {
  readonly phase: AdmissionPhase;
  readonly capture_id: string;
  /** The display this capture is of (arm only). */
  readonly display: { readonly id: string; readonly bounds: { x: number; y: number; width: number; height: number }; readonly scale_factor: number } | null;
  /** This app's overlay window of the capture, as main knows it: its process and native window handle (arm only). */
  readonly overlay: { readonly pid: number; readonly hwnd: string } | null;
  readonly sample_seq: number | null;
  readonly frame_seq: number | null;
  /** SHA-256 of the frame's RGBA pixels as the overlay took it from the stream. */
  readonly raw_sha256: string | null;
  readonly raw_size: { readonly width: number; readonly height: number } | null;
  readonly request_id: string | null;
  /** SHA-256 of the exact PNG a request sends. */
  readonly image_sha256: string | null;
};
/**
 * `ms`: from the request's write to its answer (or failure). `denied`: the checker itself answered "deny".
 * `written`: the request was written to the checker (a decision refused here, after a failure, was never asked).
 * `withdrawn`: not written, because what it was for no longer held when its turn came (not a failure of the check).
 */
export type AdmissionDecision = { readonly ok: true; readonly ms: number } | { readonly ok: false; readonly reason: string; readonly denied: boolean; readonly written: boolean; readonly withdrawn: boolean; readonly ms: number };
/** The members a request's answer echoes, each equal to the request's (every member but `sent_at`). */
const ECHOED = ['format', 'id', 'seq', 'phase', 'capture_id', 'display', 'overlay', 'sample_seq', 'frame_seq', 'raw_sha256', 'raw_size', 'request_id', 'image_sha256'] as const;
/** A value as JSON with every object's members in one order: equal values compare equal whatever order an answer gives them. */
const canonical = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const REPLY_KEYS = [...ECHOED, 'verdict', 'reason'];
/** What a refusal of each phase stopped. */
const REFUSED: Record<AdmissionPhase, string> = { arm: 'arming the capture', pre_acquire: 'taking a frame', post_acquire: 'the frame taken', send: 'sending a request' };
/** Decisions waiting for their turn behind the one that is out; more than this is a failure of the check. */
const QUEUED_MAX = 8;
/**
 * How the checker's end went: whether a process was ever started, its exit seen (with its code or signal), and
 * whether a kill was delivered to it.
 */
export type CheckerEnd = { readonly spawned: boolean; readonly exit_seen: boolean; readonly code: number | null; readonly signal: string | null; readonly killed: boolean };
const deepFreeze = <T>(v: T): T => {
  if (typeof v === 'object' && v !== null) for (const x of Object.values(v)) deepFreeze(x);
  return Object.freeze(v);
};

export type CheckerOptions = {
  readonly config: AdmissionConfig;
  /** For tests: how the child is spawned. */
  readonly spawn?: typeof spawnChild;
  /** For tests: how long the child is given to end after the end of its input. */
  readonly endMs?: number;
};
/** Why a check failed, when this app did not end the checker itself (the capture is then to be ended). */
export type FailureListener = (reason: string) => void;

/** The checker of one capture: started once, never again; ended with its capture. */
export class SourceChecker {
  private readonly o: CheckerOptions;
  private proc: ChildProcess | null = null;
  private exited: Promise<{ code: number | null; signal: string | null }> | null = null;
  private closing: Promise<CheckerEnd> | null = null;
  private queued = 0;
  /** Told once, of a failure this app did not cause by ending the checker. */
  onFailure: FailureListener | null = null;
  /** Why no further decision can be allowed (latched), or null. */
  private failedWith: string | null = null;
  private readied: ((problem: string | null) => void) | null = null;
  private waiting: { request: Record<string, unknown>; settle: (d: AdmissionDecision) => void; timer: ReturnType<typeof setTimeout>; at: number } | null = null;
  /** Ids of requests already answered (an answer given again is a replay). */
  private readonly answered = new Set<string>();
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private opened: Promise<string | null> | null = null;
  constructor(o: CheckerOptions) {
    this.o = o;
  }
  /** Why no decision can be allowed any more, or null. */
  get failure(): string | null {
    return this.failedWith;
  }

  /** Starts the checker and waits for its ready line (once; later calls get the same answer). Null when it is ready. */
  open(): Promise<string | null> {
    this.opened ??= this.closing ? Promise.resolve(this.failedWith) : this.start(); // (never started after its end)
    return this.opened;
  }

  /**
   * One decision, asked when the decisions before it are answered, and only if `still()` holds then (else it is
   * withdrawn, unwritten). Its input is not changed. Never rejects.
   */
  decide(ask: AdmissionAsk, still: () => boolean = () => true): Promise<AdmissionDecision> {
    if (this.queued >= QUEUED_MAX) {
      this.fail('too many source-check decisions were waiting');
      return Promise.resolve({ ok: false, reason: this.failedWith!, denied: false, written: false, withdrawn: false, ms: 0 });
    }
    this.queued += 1;
    const next = this.queue.then(() => {
      this.queued -= 1;
      return still() ? this.one(ask) : { ok: false as const, reason: 'what it was for no longer held when its turn came', denied: false, written: false, withdrawn: true, ms: 0 };
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /**
   * Ends the checker (once; later calls get the same answer): the end of its input, a bounded wait, then this child
   * alone is killed. Later decisions are refused, and a late answer is not read.
   */
  close(): Promise<CheckerEnd> {
    this.closing ??= this.shut();
    return this.closing;
  }

  private async shut(): Promise<CheckerEnd> {
    this.fail('the source check of this capture was ended', true);
    const proc = this.proc;
    const exited = this.exited;
    // (no process was ever started: none to end; a spawn that failed has no pid, and never exits)
    if (!proc || !exited || proc.pid === undefined) return { spawned: false, exit_seen: false, code: null, signal: null, killed: false };
    const within = (ms: number): Promise<{ code: number | null; signal: string | null } | null> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([exited, new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)))]).finally(() => clearTimeout(timer));
    };
    let exit = await within(this.o.endMs ?? END_MS);
    if (exit) return { spawned: true, exit_seen: true, ...exit, killed: false };
    let killed = false;
    try {
      killed = proc.kill(); // this child only: whether the signal was delivered
    } catch {
      // already gone
    }
    exit = await within(2000);
    return exit ? { spawned: true, exit_seen: true, ...exit, killed } : { spawned: true, exit_seen: false, code: null, signal: null, killed };
  }

  private start(): Promise<string | null> {
    const { command, args, ready_ms } = this.o.config;
    let proc: ChildProcess;
    try {
      proc = (this.o.spawn ?? spawnChild)(command, [...args], { stdio: ['pipe', 'pipe', 'ignore'], env: childEnv(), windowsHide: true, shell: false });
    } catch {
      this.fail('the source check could not be started');
      return Promise.resolve(this.failedWith);
    }
    this.proc = proc;
    proc.on('error', () => this.fail('the source check could not be started, or failed'));
    proc.stdin?.on('error', () => undefined); // (it closed its input: its end is said below)
    this.exited = new Promise((done) => proc.once('exit', (code: number | null, signal: string | null) => done({ code, signal })));
    void this.exited.then(() => this.fail('the source check ended'));
    if (!proc.stdin || !proc.stdout) {
      this.fail('the source check could not be given its pipes');
      return Promise.resolve(this.failedWith);
    }
    // Bytes are split into lines first; each line must be valid UTF-8 (nothing is replaced or guessed).
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    let buffered = Buffer.alloc(0);
    proc.stdout.on('data', (chunk: Buffer | string) => {
      if (this.failedWith !== null) return; // nothing more of it is read
      buffered = Buffer.concat([buffered, typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk]);
      for (let nl = buffered.indexOf(0x0a); nl >= 0 && this.failedWith === null; nl = buffered.indexOf(0x0a)) {
        let bytes = buffered.subarray(0, nl);
        buffered = buffered.subarray(nl + 1);
        if (bytes.length > 0 && bytes[bytes.length - 1] === 0x0d) bytes = bytes.subarray(0, bytes.length - 1);
        if (bytes.length > ADMISSION_LINE_MAX) return this.fail('the source check wrote a line that is too long');
        let line: string;
        try {
          line = utf8.decode(bytes);
        } catch {
          return this.fail('the source check wrote a line that is not UTF-8');
        }
        this.line(line);
      }
      if (buffered.length > ADMISSION_LINE_MAX) this.fail('the source check wrote a line that is too long');
    });
    proc.stdout.once('end', () => this.fail('the source check closed its output'));
    return new Promise((ready) => {
      const timer = setTimeout(() => this.fail(`the source check was not ready within ${ready_ms} ms`), ready_ms);
      this.readied = (problem) => {
        clearTimeout(timer);
        this.readied = null;
        ready(problem);
      };
      if (this.failedWith !== null) this.readied(this.failedWith); // (it failed while it was being started)
    });
  }

  private line(text: string): void {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      return this.fail('the source check wrote a line that is not JSON');
    }
    if (this.readied) {
      if (!isObj(v) || !sameKeys(v, ['format', 'ready']) || v['format'] !== ADMISSION_FORMAT || v['ready'] !== true) return this.fail('the source check did not begin with its ready line');
      return this.readied(null);
    }
    if (!isObj(v)) return this.fail('the source check wrote an answer that is not an object');
    const w = this.waiting;
    if (typeof v['id'] === 'string' && this.answered.has(v['id'])) return this.fail('the source check answered a request again');
    if (!w) return this.fail('the source check answered when no request was waiting');
    if (!sameKeys(v, REPLY_KEYS)) return this.fail('the source check\'s answer does not have exactly its members');
    for (const k of ECHOED) if (canonical(v[k]) !== canonical(w.request[k])) return this.fail(`the source check's answer is not to the request that is waiting (${k})`);
    const reason = v['reason'];
    if (!(reason === null || (typeof reason === 'string' && reason.length <= 300 && !/[\0-\x1f]/.test(reason)))) return this.fail('the source check\'s reason is malformed');
    if (v['verdict'] !== 'allow' && v['verdict'] !== 'deny') return this.fail('the source check\'s verdict is malformed');
    this.answered.add(w.request['id'] as string);
    clearTimeout(w.timer);
    this.waiting = null;
    const ms = Date.now() - w.at;
    if (v['verdict'] === 'allow') return w.settle({ ok: true, ms });
    this.failedWith = `the source check refused ${REFUSED[w.request['phase'] as AdmissionPhase]}${reason ? ` (${reason})` : ''}`;
    w.settle({ ok: false, reason: this.failedWith, denied: true, written: true, withdrawn: false, ms });
    this.end();
    this.tell();
  }

  private one(ask: AdmissionAsk): Promise<AdmissionDecision> {
    if (this.failedWith !== null) return Promise.resolve({ ok: false, reason: this.failedWith, denied: false, written: false, withdrawn: false, ms: 0 });
    if (!this.proc || this.readied || this.opened === null) return Promise.resolve(this.refuseNow('the source check was not ready when a decision was needed'));
    // (made now, when it is written: its time is this one; frozen, so what is compared with the answer is what was sent)
    const request: Record<string, unknown> = deepFreeze({
      format: ADMISSION_FORMAT,
      id: randomBytes(16).toString('hex'),
      seq: (this.seq += 1),
      phase: ask.phase,
      capture_id: ask.capture_id,
      display: ask.display,
      overlay: ask.overlay,
      sample_seq: ask.sample_seq,
      frame_seq: ask.frame_seq,
      raw_sha256: ask.raw_sha256,
      raw_size: ask.raw_size,
      request_id: ask.request_id,
      image_sha256: ask.image_sha256,
      sent_at: new Date().toISOString(),
    });
    const line = JSON.stringify(request);
    if (Buffer.byteLength(line) > ADMISSION_LINE_MAX) return Promise.resolve(this.refuseNow('a source-check request would be too long'));
    return new Promise((settle) => {
      const at = Date.now();
      const timer = setTimeout(() => this.fail(`the source check did not answer within ${this.o.config.decision_ms} ms`), this.o.config.decision_ms);
      this.waiting = { request, settle, timer, at };
      try {
        this.proc!.stdin!.write(`${line}\n`);
      } catch {
        this.fail('a source-check request could not be written');
      }
    });
  }

  private refuseNow(reason: string): AdmissionDecision {
    this.fail(reason);
    return { ok: false, reason: this.failedWith!, denied: false, written: false, withdrawn: false, ms: 0 };
  }

  /**
   * Latches the failure (the first reason stays: the checker's own end at a close never replaces it), refuses what
   * is waiting, and ends the child's input. `closing`: this app is ending it (nobody is told of that as a failure).
   */
  private fail(reason: string, closing = false): void {
    const first = this.failedWith === null;
    if (first) this.failedWith = reason;
    this.readied?.(this.failedWith);
    const w = this.waiting;
    this.waiting = null;
    if (w) {
      clearTimeout(w.timer);
      w.settle({ ok: false, reason: this.failedWith!, denied: false, written: true, withdrawn: false, ms: Date.now() - w.at });
    }
    this.end();
    if (first && !closing) this.tell();
  }
  private told = false;
  /** Told after what was waiting has taken its own answer (a decision is recorded before the failure it caused). */
  private tell(): void {
    if (this.told || this.closing) return;
    this.told = true;
    setImmediate(() => {
      if (!this.closing) this.onFailure?.(this.failedWith!);
    });
  }

  /** Nothing more is asked of it: its input is ended (close() waits for its end, and kills it if it does not). */
  private end(): void {
    try {
      this.proc?.stdin?.end();
    } catch {
      // already closed
    }
  }
}
