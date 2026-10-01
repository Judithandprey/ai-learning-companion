// The managed ChatGPT subscription (docs/adr/0003-managed-subscription-ask.md), from this app's side: the shared
// connector (services.worker.connectors.chatgpt_local) run as a private foreground child of this main process, spoken
// to in the private local envelope lc-subscription-ask/1 over its input and output, one JSON line each way.
//
// - Off unless the environment variable LC_SUBSCRIPTION_CONNECTOR names a trusted launch configuration. Only this
//   main process reads it; no window can set or see a path in it.
// - The connector, and the official Codex app server it runs, own the sign-in: this app never opens, copies or reads
//   a credential, a token or a cookie, and never signs anything out. It shows only the sign-in state, the plan's
//   label, the quota windows and the model catalog the connector reports.
// - A sign-in page is opened in the user's browser only on the user's own press, and only at an official address.
// - One question at a time, sent only on an explicit Ask. A question is never sent again by this app: an answer that
//   did not come is said as that. A cancelled question's answer is never shown, and a stopped capture session can
//   never ask again.
// - The child is ended by the end of its input (a bounded wait, then this child alone is killed). Nothing it writes
//   is logged; nothing but the envelope's own fields is read.
import { spawn as spawnChild, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { childEnv, endChild, type HostExit } from './capture-host.ts';
import { ASK_VERSION, ERROR_TEXT, loginErrorText, readErrorText, LINE_FROM_CONNECTOR_MAX, LINE_TO_CONNECTOR_MAX, officialLoginUrl, readAccount, readAnswer, type Answer, type AskRequest, type Model, type RateLimit } from '../shared/subscription-ask.ts';

// ---- configuration (trusted, main process only) ---------------------------------------------------------------
/**
 * Windows: through wsl.exe into the WSL distribution that holds the Backend checkout and the Codex install. `python`
 * is the trusted executable run there (the Backend's own python; a check may name its own stand-in instead).
 * There is no POSIX route: the connector takes only private pipes, and this process's own child stdio there is a
 * socket pair.
 */
export type ConnectorLaunch = { readonly kind: 'wsl'; readonly distribution: string; readonly user: string; readonly cd: string; readonly python: string };
export type ConnectorConfig = { readonly launch: ConnectorLaunch; readonly state_dir: string | null; readonly codex_bin: string | null };
const CONFIG_FORMAT = 'lc-windows-subscription-connector/v1';
const MODULE = 'services.worker.connectors.chatgpt_local';
const isText = (v: unknown, max = 4096): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\0\r\n]/.test(v);

/** The configuration named by LC_SUBSCRIPTION_CONNECTOR, or null when it is not set (the subscription is off). */
export function readConnectorConfig(env: Readonly<Record<string, string | undefined>>, read: (path: string) => string = (p) => readFileSync(p, 'utf8')): ConnectorConfig | { error: string } | null {
  const path = env['LC_SUBSCRIPTION_CONNECTOR'];
  if (!path) return null;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(read(path)) as Record<string, unknown>;
  } catch {
    return { error: 'the subscription connector configuration could not be read' };
  }
  const bad = { error: 'the subscription connector configuration is not valid' };
  const l = v?.['launch'] as Record<string, unknown> | undefined;
  if (v?.['format'] !== CONFIG_FORMAT || typeof l !== 'object' || l === null) return bad;
  const optional = (k: string): string | null | undefined => (v[k] === undefined || v[k] === null ? null : isText(v[k]) ? (v[k] as string) : undefined);
  const state_dir = optional('state_dir');
  const codex_bin = optional('codex_bin');
  if (state_dir === undefined || codex_bin === undefined) return bad;
  if (l['kind'] === 'wsl' && isText(l['distribution'], 64) && isText(l['user'], 64) && isText(l['cd']) && isText(l['python'])) {
    return { launch: { kind: 'wsl', distribution: l['distribution'], user: l['user'], cd: l['cd'], python: l['python'] }, state_dir, codex_bin };
  }
  return bad;
}

// ---- what the windows are told (counts, labels and states only) --------------------------------------------------
export type SubscriptionStatus =
  | { readonly mode: 'off' }
  | { readonly mode: 'unavailable'; readonly reason: string }
  | {
      readonly mode: 'managed';
      /** signed_in: Codex reports a managed ChatGPT account. It does not show that a model answers. */
      readonly state: 'not_checked' | 'checking' | 'signed_in' | 'signed_out' | 'unknown' | 'unavailable';
      readonly plan: string | null;
      readonly rate_limits: RateLimit[] | null;
      readonly models: Model[];
      /** The model a question is sent to (one that takes pictures), or null. */
      readonly model: string | null;
      readonly login: 'none' | 'starting' | 'waiting' | 'failed' | 'cancelled' | 'refused_address';
      readonly detail: string | null;
      /** A question is out (sent, or still being cancelled). */
      readonly asking: boolean;
    };

/** How a question ended. Only `answered` carries text, and only for the request that was sent. */
export type AskOutcome =
  | { readonly status: 'answered'; readonly answer: Answer }
  /** Known not answered: the connector's own refusal, or this app's (nothing is sent again). */
  | { readonly status: 'refused'; readonly code: string; readonly reason: string }
  /** Cancelled here: nothing of it is shown. `uncertain`: whether ChatGPT stopped working on it is not confirmed. */
  | { readonly status: 'cancelled'; readonly uncertain: boolean }
  /** No answer came: whether ChatGPT worked on it (and used quota) is not known. */
  | { readonly status: 'uncertain'; readonly reason: string };

/** A connector that was ended here and whose own end was not seen: when, and whether its wsl.exe shim's exit was. */
export type ConnectorEnd = { readonly at: string; readonly shim: 'ended' | 'not_ended' };
export type SubscriptionOptions = {
  readonly config: ConnectorConfig;
  readonly notify: (s: SubscriptionStatus) => void;
  /** Opens an address in the user's browser (only ever called on the user's press, with an official address). */
  readonly openExternal: (url: string) => Promise<void> | void;
  /** For tests: how the child is spawned. */
  readonly spawn?: typeof spawnChild;
  /** Bounds (ms): a read or sign-in request; a question; the child's end. */
  readonly request_ms?: number;
  readonly ask_ms?: number;
  readonly end_ms?: number;
  /** The span in which at most CHANGE_READS_MAX reads are made because the connector said the account changed. */
  readonly change_window_ms?: number;
  /**
   * Writes one unconfirmed end to this device. `again`: this end was written before, and is written again because
   * its shim's exit was seen since (it is the same end, never one more). Null, or why it was not written.
   */
  readonly recordEnd?: (end: ConnectorEnd, again: boolean) => string | null;
  /** What earlier runs of this app recorded so: the kept ones, how many older ones are no longer listed, and whether the record could not be read. */
  readonly earlier?: { readonly ends: ReadonlyArray<ConnectorEnd>; readonly older: number; readonly unreadable: boolean };
};

type Reply = { ok: true; result: unknown } | { ok: false; code: string } | { ok: false; lost: 'not_sent' | 'no_answer' };
type Child = { proc: ChildProcess; exited: Promise<HostExit>; gone: boolean };
/** A question that is out. `interrupts`: what its cancel or its session's Stop was answered (each bounded). */
type Asking = { readonly id: string; readonly session: string; cancelled: boolean; interrupts: Array<Promise<boolean>> };
/**
 * How many reads the connector's "the account changed" may cause between the user's own Checks: within one span
 * (10 s), and in all. A rate alone would let a slow, steady "changed" keep this app reading without end.
 */
const CHANGE_READS_MAX = 3;
const CHANGE_READS_TOTAL_MAX = 64;
/**
 * How long a connector is given to end at the end of its input: its own cleanup bound (8 s, for the Codex app server
 * it runs) and a margin for its exit to arrive through wsl.exe. Only then is its shim ended.
 */
export const CONNECTOR_END_MS = 10_000;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Whether a cancel's answer says the turn was interrupted for certain: exactly {cancelled: true, uncertain: false}. */
const cancelConfirmed = (r: Reply): boolean => r.ok && isObject(r.result) && Object.keys(r.result).sort().join() === 'cancelled,uncertain' && r.result['cancelled'] === true && r.result['uncertain'] === false;
/** Whether a Stop's (or a sign-in cancel's) answer is its acknowledgement: exactly {}. (An unconfirmed interruption is its error.) */
const acknowledged = (r: Reply): boolean => r.ok && isObject(r.result) && Object.keys(r.result).length === 0;
/** A sign-in cancel answered "no such sign-in" (the connector's `invalid_request` for a well-formed cancel): it is not pending there. */
const notHeld = (r: Reply): boolean => !r.ok && 'code' in r && r.code === 'invalid_request';
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max && !/[\0-\x1f\x7f]/.test(v) ? v : null);

/** What earlier runs recorded of connector ends that were not seen, as it is said: past facts only. */
export function earlierNotes(earlier: SubscriptionOptions['earlier']): string[] {
  if (!earlier) return [];
  const n = earlier.ends.length + earlier.older;
  return [
    ...(n === 0 ? [] : [`earlier runs of this app recorded ${n} connector end(s) that were not seen (the latest at ${earlier.ends.at(-1)?.at ?? 'a time no longer listed'}; wsl.exe shim not seen to end either: ${earlier.ends.filter((e) => e.shim === 'not_ended').length} of the ${earlier.ends.length} listed); these are past records: they do not show that anything is still running, or that it has ended since`]),
    ...(earlier.unreadable ? ['the record of connector ends from earlier runs could not be read on this device, and is left as it is'] : []),
  ];
}

export class Subscription {
  private readonly o: SubscriptionOptions;
  private child: Child | null = null;
  /** The end of a child that was fenced here (the quit waits for it too). */
  private closing: Promise<unknown> = Promise.resolve();
  /** The account changed, or a sign-in completed, while a read was out: it is read once more after it. */
  private readAgain = false;
  /** Reads caused by "the account changed" in the current span; `off`: no more until the user's own Check. */
  private changes = { since: 0, count: 0, total: 0, off: false };
  /**
   * Of the pending sign-in, by its id: its cancel is out (its answer is waited for); its cancel was not
   * acknowledged; its page could not be opened in the browser.
   */
  private cancelling: string | null = null;
  private unconfirmedCancel: string | null = null;
  private unopened: string | null = null;
  /**
   * Connectors ended here whose own end was not seen: their shim was ended, or not even that was seen. Kept for the
   * app's run: nothing this app sees later shows that what they ran in WSL ended.
   */
  private readonly unconfirmedEnds = new Map<Child, ConnectorEnd & { unsaved: string | null }>();
  /** The app is closing: the connector is being ended. */
  private quitting = false;
  /** Connectors ended here whose end is still being waited for. */
  private endings = 0;
  private readonly pending = new Map<string, (r: Reply) => void>();
  private seq = 0;
  private state: Extract<SubscriptionStatus, { mode: 'managed' }>['state'] = 'not_checked';
  private plan: string | null = null;
  private limits: RateLimit[] | null = null;
  private models: Model[] = [];
  private model: string | null = null;
  private loginState: Extract<SubscriptionStatus, { mode: 'managed' }>['login'] = 'none';
  private loginId: string | null = null;
  /** Sign-in completions that came before this app knew its sign-in's id (the connector may write them with its reply). */
  private earlyLogins: unknown[] = [];
  private detail: string | null = null;
  private asking: Asking | null = null;
  /** Capture sessions that were stopped: none of them can ask again, whatever child is running. */
  private readonly stopped = new Set<string>();

  constructor(o: SubscriptionOptions) {
    this.o = o;
  }

  status(): SubscriptionStatus {
    // What is said beside the state, derived from it: no later text wipes these, and none outlives what it says.
    const pending = this.loginState === 'waiting' && this.loginId !== null;
    const ends = [...this.unconfirmedEnds.values()];
    const unsaved = ends.find((e) => e.unsaved !== null);
    const notes = [
      this.detail,
      this.quitting ? 'the app is closing: the connector is being ended' : null,
      ends.length === 0 ? null
        : `a connector that was ended here did not end by itself in time; ${ends.some((e) => e.shim === 'not_ended') ? 'its wsl.exe shim did not end either, so it is not known' : 'its wsl.exe shim was ended, which does not show'} that the connector, or the Codex app server it runs, ended in WSL` +
          (unsaved ? `; this is not written on this device as it is said here (${unsaved.unsaved}); writing it is tried again as the app quits, and unless that works the next launch will not say it as it is said here` : ''),
      ...earlierNotes(this.o.earlier), // past facts only: nothing here shows what is so now
      this.changes.off && this.state === 'unknown' ? 'the account may have changed since it was last read, and it is not read again by itself; check again' : null,
      !pending ? null
        : this.cancelling === this.loginId ? 'the sign-in is being cancelled'
        : this.unconfirmedCancel === this.loginId ? 'the cancel of the sign-in was not confirmed: it may still be pending in the connector; cancel it again'
        : this.unopened === this.loginId ? 'the browser could not be opened for the sign-in page; the sign-in is still pending: cancel it, then sign in again'
        : this.state === 'signed_in' ? 'a sign-in started here is still pending: finish it in your browser, or cancel it' : null,
    ].filter((n) => n !== null);
    return { mode: 'managed', state: this.state, plan: this.plan, rate_limits: this.limits, models: this.models, model: this.model, login: this.loginState, detail: notes.join('; ') || null, asking: this.asking !== null };
  }
  private say(): void {
    this.o.notify(this.status());
  }

  // ---- the child and its lines -----------------------------------------------------------------------------------
  private start(): Child | null {
    if (this.child && !this.child.gone) return this.child;
    const { launch, state_dir, codex_bin } = this.o.config;
    // Nothing of this app's configuration reaches the child but these two trusted settings.
    const env = childEnv();
    const passed = [['LC_SUBSCRIPTION_STATE_DIR', state_dir], ['LC_SUBSCRIPTION_CODEX_BIN', codex_bin]].filter((kv): kv is [string, string] => kv[1] !== null);
    for (const [k, v] of passed) env[k] = v;
    if (passed.length > 0) env['WSLENV'] = passed.map(([k]) => `${k}/u`).join(':'); // carried into WSL, as they are
    let proc: ChildProcess;
    try {
      const spawn = this.o.spawn ?? spawnChild;
      proc = spawn('wsl.exe', ['--distribution', launch.distribution, '--user', launch.user, '--cd', launch.cd, '--exec', launch.python, '-m', MODULE], { stdio: ['pipe', 'pipe', 'ignore'], env, windowsHide: true });
    } catch {
      return null;
    }
    proc.on('error', () => undefined);
    if (!proc.stdin || !proc.stdout) return null; // it could not be given its pipes: not started
    // The child's own errors and its input's (it closed it) are taken here, never thrown.
    proc.stdin.on('error', () => undefined);
    const child: Child = { proc, gone: false, exited: new Promise<HostExit>((resolve) => {
      const over = (code: number | null, signal: string | null, started: boolean): void => {
        resolve({ code, signal, error: null }); // its real end, also when it was already fenced here
        if (child.gone) return;
        child.gone = true;
        this.lost(child, started);
      };
      proc.once('exit', (code, signal) => over(code, signal, true));
      proc.once('error', () => (proc.pid === undefined ? over(null, null, false) : undefined)); // it never started
    }) };
    let buffered: Buffer[] = [];
    let size = 0;
    proc.stdout.on('data', (chunk: Buffer) => {
      if (child.gone) return; // ended here (a line that was not the envelope's): nothing more of it is read
      let from = 0;
      for (let nl = chunk.indexOf(0x0a, from); nl >= 0; nl = chunk.indexOf(0x0a, from)) {
        const line = Buffer.concat([...buffered, chunk.subarray(from, nl)]);
        buffered = [];
        size = 0;
        from = nl + 1;
        if (line.length > LINE_FROM_CONNECTOR_MAX) return void this.fence(child);
        this.line(line.toString('utf8'));
      }
      const rest = chunk.subarray(from);
      size += rest.length;
      if (size > LINE_FROM_CONNECTOR_MAX) return void this.fence(child); // more than one line may be: not kept
      if (rest.length > 0) buffered.push(rest);
    });
    this.child = child;
    return child;
  }
  /**
   * The child is ended here (a line that is not the envelope's, or the quit): from now nothing more of it is read,
   * what was out gets no answer, and its end is waited for in `closing`.
   */
  private fence(child: Child): void {
    if (child.gone) return;
    child.gone = true;
    this.lost(child, true, false);
    this.endings += 1;
    const ending = endChild(child.proc, () => child.proc.stdin?.end(), child.exited, this.o.end_ms ?? CONNECTOR_END_MS, 'wsl').then((end) => {
      this.endings -= 1;
      if (end.ended) return;
      // It did not end by itself in time. Ending its wsl.exe shim does not show that what it ran in WSL ended: said,
      // never assumed, and nothing is started in its place by this app.
      const at = new Date().toISOString();
      this.noteEnd(child, { at, shim: end.exit ? 'ended' : 'not_ended' });
      if (end.exit) return;
      // The shim's own exit may still come after the bound: then that much is said (still not the connector's end).
      void child.exited.then(() => this.noteEnd(child, { at, shim: 'ended' }));
    });
    this.closing = Promise.all([this.closing, ending]); // one before may still be ending
  }
  /** Keeps an end that was not seen, writes it to this device (when a place for it was given), and says it. */
  private noteEnd(child: Child, end: ConnectorEnd): void {
    const before = this.unconfirmedEnds.get(child);
    const again = before !== undefined && before.unsaved === null; // written before: the same end, said again
    this.unconfirmedEnds.set(child, { ...end, unsaved: this.o.recordEnd?.(end, again) ?? null });
    this.say();
  }
  private line(text: string): void {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      return; // not a line of the envelope: dropped
    }
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return;
    const m = v as Record<string, unknown>;
    if (typeof m['id'] === 'string') {
      const done = this.pending.get(m['id']);
      if (!done) return; // an answer nothing waits for (cancelled, or timed out): dropped
      this.pending.delete(m['id']);
      const error = m['error'] as Record<string, unknown> | undefined;
      if (typeof error === 'object' && error !== null) return done({ ok: false, code: typeof error['code'] === 'string' && Object.hasOwn(ERROR_TEXT, error['code']) ? error['code'] : 'failed' });
      return done({ ok: true, result: m['result'] });
    }
    if (m['method'] === 'connection/login/completed') this.loginCompleted(m['params']);
    // The connector says the account changed (signed in or out elsewhere in this product's state): read again.
    if (m['method'] === 'connection/changed' && this.state !== 'not_checked') void this.read(false);
  }
  /** Whether `child` is still the connector this app speaks to (not ended here, not gone, not replaced). */
  private live(child: Child | null): boolean {
    return child !== null && this.child === child && !child.gone;
  }
  /** The child is gone: what was out gets no answer (or, if it never started, was not sent). */
  private lost(child: Child, started = true, endSeen = true): void {
    if (this.child !== child) return;
    this.child = null;
    for (const [id, done] of [...this.pending]) {
      this.pending.delete(id);
      done({ ok: false, lost: started ? 'no_answer' : 'not_sent' });
    }
    if (this.loginState === 'waiting' || this.loginState === 'starting') {
      this.loginState = 'failed';
      this.loginId = null;
      this.detail = endSeen ? 'the connector ended before the sign-in completed' : 'the connector was ended here before the sign-in completed'; // (ended here: its own end is not claimed)
    }
    if (this.state !== 'not_checked') this.state = 'unavailable';
    this.say();
  }
  /** One request and its reply. `running`: only to a child already running (a cancel or a Stop never starts one). */
  private request(method: string, params: object, ms: number, running = false): Promise<Reply> {
    const child = running ? (this.child && !this.child.gone ? this.child : null) : this.start();
    if (!child) return Promise.resolve({ ok: false, lost: 'not_sent' });
    const id = `r${++this.seq}`;
    const line = `${JSON.stringify({ version: ASK_VERSION, id, method, params })}\n`;
    if (Buffer.byteLength(line) > LINE_TO_CONNECTOR_MAX) return Promise.resolve({ ok: false, code: 'invalid_request' });
    return new Promise<Reply>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) resolve({ ok: false, lost: 'no_answer' });
      }, ms);
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      child.proc.stdin!.write(line, (error) => {
        // Not taken by the child: this request was not sent.
        if (error && this.pending.delete(id)) {
          clearTimeout(timer);
          resolve({ ok: false, lost: 'not_sent' });
        }
      });
    });
  }

  // ---- the connection ------------------------------------------------------------------------------------------
  /** On the user's press (and when the user's own sign-in completes): reads the account. */
  check(): Promise<void> {
    return this.read(true);
  }
  /** Whether one more read may be made because the connector said the account changed. */
  private changeRead(): boolean {
    const c = this.changes;
    const now = Date.now();
    if (now - c.since >= (this.o.change_window_ms ?? 10_000)) Object.assign(c, { since: now, count: 0 });
    c.total += 1;
    return (c.count += 1) <= CHANGE_READS_MAX && c.total <= CHANGE_READS_TOTAL_MAX;
  }
  /** Reads the sign-in state, the plan, the quota windows and the models (the connector's handshake). */
  private async read(byUser: boolean): Promise<void> {
    if (byUser) this.changes = { since: 0, count: 0, total: 0, off: false };
    // A read is out: what it returns may be older than the change that asked for this one, so it is read once more.
    if (this.state === 'checking') return void (this.readAgain = true);
    if (!byUser && this.changes.off) return; // said already: nothing more is read for a change until the user's own Check
    if (!byUser && !this.changeRead()) {
      // The connector keeps saying the account changed: it is not read again and again. What was read may be older
      // than the last change, so it is not said as how the account is now.
      this.changes.off = true; // (said with the state, by status())
      this.state = 'unknown';
      this.detail = null;
      return this.say();
    }
    this.state = 'checking';
    this.detail = null;
    this.say();
    this.readAgain = false;
    const first = this.request('connection/read', {}, this.o.request_ms ?? 30_000); // may start the connector (the user's Check)
    const child = this.child; // the connector it went to: what follows is this one's, or nothing
    let r = await first;
    // Only reads: no sign-in and no question is ever started by this, and no connector either (a re-read goes only
    // to the one that said it changed). Bounded across reads and checks, so a connector that says "changed" at or
    // after every read cannot keep this app reading; the state is then "not known" until the user checks again.
    while (r.ok && this.live(child) && this.readAgain && this.changeRead()) {
      this.readAgain = false;
      r = await this.request('connection/read', {}, this.o.request_ms ?? 30_000, true);
    }
    const changedSince = this.readAgain && r.ok; // it changed again during the last read: what was read may be older
    this.readAgain = false;
    if (changedSince) this.changes.off = true;
    if (r.ok && !this.live(child)) {
      // It answered, and was then ended or lost (a line that is not the envelope's, its exit, the quit): what it said
      // is not said as how the account is now, and no other connector is started for it.
      this.state = 'unavailable';
      this.detail = 'the connector was lost while the account was being read';
      return this.say();
    }
    const account = r.ok ? readAccount(r.result) : null;
    if (!account) {
      this.state = 'unavailable';
      this.detail = r.ok ? 'the connector answered in a form this app does not read' : 'lost' in r ? (r.lost === 'not_sent' ? 'the connector could not be started' : 'the connector did not answer') : readErrorText(r.code);
      return this.say();
    }
    this.state = changedSince ? 'unknown' : account.state; // not said as signed in (or out) from a read older than the change
    this.plan = account.plan;
    this.limits = account.rate_limits;
    this.models = account.models;
    // The chosen model is kept if it is still there and takes pictures; else the catalog's default that does.
    const usable = account.models.filter((m) => m.image_input);
    if (!usable.some((m) => m.id === this.model)) this.model = (usable.find((m) => m.default) ?? usable[0])?.id ?? null;
    // Signed in: what an earlier sign-in attempt ended as is no longer said. One that is still pending is not
    // forgotten: the connector holds it (and refuses questions) until it completes or is cancelled.
    if (this.state === 'signed_in' && this.loginState !== 'starting' && this.loginState !== 'waiting') this.loginState = 'none';
    this.say();
  }
  /** The model questions are sent to: one of the catalog's that takes pictures. */
  chooseModel(id: unknown): boolean {
    if (!this.models.some((m) => m.id === id && m.image_input)) return false;
    this.model = id as string;
    this.say();
    return true;
  }
  /** On the user's press: the official managed sign-in is started, and its page opened in the user's browser. */
  async login(): Promise<void> {
    if (this.loginState === 'starting' || this.loginState === 'waiting') return;
    this.loginState = 'starting';
    this.detail = null;
    this.unconfirmedCancel = null;
    this.unopened = null;
    this.earlyLogins = [];
    this.say();
    const started = this.request('connection/login/start', {}, this.o.request_ms ?? 30_000);
    const child = this.child;
    const r = await started;
    if (r.ok && !this.live(child)) return; // it answered, and was then ended or lost: said as failed already; nothing is opened
    const early = this.earlyLogins.splice(0);
    const result = r.ok && typeof r.result === 'object' && r.result !== null ? (r.result as Record<string, unknown>) : null;
    const id = result ? text(result['login_id'], 128) : null;
    if (!result || !id) {
      this.loginState = 'failed';
      this.detail = r.ok ? 'the connector answered in a form this app does not read' : 'lost' in r ? 'the connector did not answer' : loginErrorText(r.code);
      return this.say();
    }
    const url = officialLoginUrl(result['auth_url']);
    if (!url) {
      // Not an address this app opens: the sign-in is cancelled, and nothing is opened. Whether the connector let it
      // go is what the cancel was answered: acknowledged, or "no such sign-in" (it is over there already).
      const cancel = await this.request('connection/login/cancel', { login_id: id }, this.o.request_ms ?? 30_000, true);
      if (!this.live(child)) return; // lost meanwhile: said as failed already
      const NOT_OPENED = 'the sign-in address the connector gave is not an official ChatGPT address, so it was not opened';
      if (!acknowledged(cancel) && !notHeld(cancel)) {
        // The connector did not let go of a sign-in this app refused: it is ended, so nothing stays pending in it.
        // (Only the user's own Check starts one again.)
        this.fence(child!);
        this.loginState = 'refused_address';
        this.detail = `${NOT_OPENED}; the connector did not confirm that it let that sign-in go, so that connector is no longer used and is being ended (check the connection to start one again)`;
        return this.say();
      }
      this.loginState = 'refused_address';
      this.detail = NOT_OPENED;
      return this.say();
    }
    this.loginId = id;
    this.loginState = 'waiting';
    // A completion that came with the reply is this sign-in's: nothing is opened for one already over.
    for (const e of early) this.loginCompleted(e);
    if (this.loginId !== id) return;
    this.say();
    try {
      await this.o.openExternal(url);
    } catch {
      if (this.loginId !== id || this.loginState !== 'waiting') return; // over meanwhile (lost, cancelled, completed): what was said stands
      this.unopened = id; // (said with the state, by status())
      this.say();
    }
  }
  /**
   * Cancels only this app's pending sign-in (nothing else is signed out). It is said as cancelled once the connector
   * acknowledged the cancel; until then it is still this app's pending sign-in, so its completion is still taken.
   */
  async cancelLogin(): Promise<void> {
    const id = this.loginId;
    if (!id || this.loginState !== 'waiting' || this.cancelling === id) return;
    this.cancelling = id;
    this.unconfirmedCancel = null;
    this.say();
    const r = await this.request('connection/login/cancel', { login_id: id }, this.o.request_ms ?? 30_000, true);
    if (this.cancelling === id) this.cancelling = null;
    if (this.loginId !== id) return; // over meanwhile (it completed, failed, or the connector was lost): what was said stands
    if (acknowledged(r)) {
      this.loginId = null;
      this.loginState = 'cancelled';
      this.detail = null;
      return this.say();
    }
    if (notHeld(r)) {
      // The connector holds no such sign-in: it is over there, and no completion of it reached this app.
      this.loginId = null;
      this.loginState = 'failed';
      this.detail = 'the connector no longer holds that sign-in; whether it completed is not known (check the connection)';
      return this.say();
    }
    // Not acknowledged (another error, no answer, another shape): the connector may still hold it, or it may complete.
    this.unconfirmedCancel = id;
    this.say();
  }
  private loginCompleted(params: unknown): void {
    const p = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
    if (this.loginState === 'starting' && this.loginId === null) return void (this.earlyLogins.length < 4 ? this.earlyLogins.push(params) : undefined);
    if (this.loginId === null || p['login_id'] !== this.loginId) return; // not this app's pending sign-in
    this.loginId = null;
    if (p['success'] === true) {
      this.loginState = 'none';
      this.detail = null;
      this.say();
      void this.check();
      return;
    }
    // The connector's two fixed descriptions; nothing else of it is shown.
    this.loginState = p['error'] === 'login_cancelled' ? 'cancelled' : 'failed';
    this.detail = null;
    this.say();
  }

  // ---- a question -----------------------------------------------------------------------------------------------
  /** Why a question cannot be sent now, or null. */
  notAskable(captureSession: string): string | null {
    if (this.stopped.has(captureSession)) return ERROR_TEXT['session_stopped']!;
    if (this.state !== 'signed_in') {
      return {
        not_checked: 'the ChatGPT subscription has not been checked yet (use the control window)',
        checking: 'the ChatGPT subscription is being checked',
        unknown: 'the sign-in state of the ChatGPT subscription is not known (check it in the control window)',
        unavailable: ERROR_TEXT['unavailable']!,
        signed_out: ERROR_TEXT['unauthenticated']!,
      }[this.state];
    }
    // The connector refuses a question while a sign-in is pending in it: said here, and nothing is sent.
    if (this.loginState === 'starting') return 'a sign-in is being started: no question can be sent until that sign-in is over';
    if (this.loginState === 'waiting') return this.unopened === this.loginId ? 'a sign-in is still pending, though its page could not be opened: cancel it in the control window' : 'a sign-in is still pending: finish it in your browser, or cancel it in the control window';
    if (!this.model) return 'no model that takes pictures is available';
    if (this.asking) return this.asking.cancelled ? 'the question before is still being cancelled' : ERROR_TEXT['busy']!;
    return null;
  }
  /** Sends one question, once. Resolves with how it ended; never throws. */
  async ask(request: AskRequest): Promise<AskOutcome> {
    const session = request.context.capture_session_id;
    const no = this.notAskable(session);
    if (no) return { status: 'refused', code: 'local', reason: no };
    const a: Asking = { id: request.request_id, session, cancelled: false, interrupts: [] };
    this.asking = a;
    this.say();
    const sent = this.request('ask/start', { request, model: this.model }, this.o.ask_ms ?? 300_000);
    const child = this.child; // the connector it went to
    const r = await sent;
    // Given up here with no answer: the turn is interrupted, in the child that has it (never a new one).
    if (!r.ok && 'lost' in r && r.lost === 'no_answer' && !a.cancelled) void this.request('ask/cancel', { request_id: a.id }, this.o.request_ms ?? 30_000, true);
    // Cancelled, or its session stopped, while it was out: whatever came is not shown. Whether ChatGPT stopped
    // working on it is what the cancel or the Stop was answered (each bounded); anything else is not confirmed.
    let outcome: AskOutcome | null = null;
    if (a.cancelled || this.stopped.has(session)) {
      const interrupted = await Promise.all(a.interrupts);
      const confirmed = !r.ok && 'code' in r && r.code === 'cancelled' && interrupted.length > 0 && interrupted.every(Boolean);
      outcome = { status: 'cancelled', uncertain: !confirmed };
    }
    this.asking = null;
    this.say();
    if (outcome) return outcome;
    if (r.ok) {
      const answer = readAnswer(r.result, request);
      return typeof answer === 'string' ? { status: 'refused', code: 'unbound', reason: `${answer}; it is not shown` } : { status: 'answered', answer };
    }
    if ('lost' in r) return r.lost === 'not_sent' ? { status: 'refused', code: 'unavailable', reason: 'the connector could not be reached, so the question was not sent' } : { status: 'uncertain', reason: 'no answer came; whether ChatGPT worked on the question is not known' };
    // Cancelled by the connector, not asked for here (no Cancel and no Stop of this app, so no acknowledgement of an
    // interruption either): whether ChatGPT stopped working on it is not known.
    if (r.code === 'cancelled') return { status: 'cancelled', uncertain: true };
    if (r.code === 'interrupt_unconfirmed') return { status: 'cancelled', uncertain: true };
    if (r.code === 'unauthenticated' && this.live(child)) {
      // (a connector ended or lost since is said as not available, not as signed out)
      if (this.state === 'checking') this.readAgain = true; // a read is out: it is read once more, and that says how it is
      else if (!this.changes.off) {
        // (while changes are no longer read the state stays "not known": only the user's Check says how it is)
        if (this.state === 'unavailable') this.detail = null; // a failed read's reason is not said beside it
        this.state = 'signed_out';
        this.say();
      }
    }
    return { status: 'refused', code: r.code, reason: ERROR_TEXT[r.code]! };
  }
  /** Cancels the question that is out, if it is this one: from now its answer is not shown. */
  cancel(requestId: string): void {
    const a = this.asking;
    if (!a || a.id !== requestId || a.cancelled) return;
    a.cancelled = true;
    this.say();
    a.interrupts.push(this.request('ask/cancel', { request_id: requestId }, this.o.request_ms ?? 30_000, true).then(cancelConfirmed));
  }
  /** The capture session ended: it can never ask again, and its question that is out is cancelled. */
  stopSession(captureSession: string): void {
    if (this.stopped.has(captureSession)) return;
    this.stopped.add(captureSession);
    const a = this.asking;
    // Told to a child that is running (one that never ran has nothing of this session).
    const told = this.request('session/stop', { capture_session_id: captureSession }, this.o.request_ms ?? 30_000, true);
    if (a && a.session === captureSession) {
      a.cancelled = true;
      a.interrupts.push(told.then(acknowledged));
      this.say();
    }
  }

  /** Whether a connector is running (not ended here, not gone), or one that was ended here is still ending. */
  running(): boolean {
    return this.live(this.child);
  }
  ending(): boolean {
    return this.endings > 0;
  }
  /** Why an end that was not seen is not written on this device, if one is not; else null. */
  endsUnsaved(): string | null {
    return [...this.unconfirmedEnds.values()].find((e) => e.unsaved !== null)?.unsaved ?? null;
  }
  /**
   * At quit: the child is ended (bounded); resolves when it is gone or at the bound. What it still writes is not
   * read. An end that was not seen is written to this device before this resolves; one that could not be written
   * before is tried once more.
   */
  async quit(): Promise<void> {
    if (this.asking) this.asking.cancelled = true;
    if (this.child || this.endings > 0) this.quitting = true;
    if (this.child) this.fence(this.child); // (the fence says it)
    else if (this.quitting) this.say();
    await this.closing;
    this.quitting = false;
    for (const [child, e] of this.unconfirmedEnds) if (e.unsaved !== null) this.unconfirmedEnds.set(child, { at: e.at, shim: e.shim, unsaved: this.o.recordEnd?.({ at: e.at, shim: e.shim }, false) ?? null });
    this.say();
  }
}
