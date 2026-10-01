// Development only: the link from this app's capture sessions to the released foreground local host
// (services.api.desktop_local, capture-host.ts), over its private pipe and loopback port. Off unless the environment
// variable LC_DEV_CAPTURE_HOST names an explicit development configuration; the dedicated test database (lc_p0_test)
// only. It stores whole-display frames and editable-ink originals there; no AI is connected.
//
// - An explicit user Start begins one stream. Its registration and grant request are written to the coordination
//   record first; then the host starts with fresh consent (nothing else ever asks for it), the stream is registered
//   under its own key and its display source is created.
// - Each retained manifest line is sent, in order, as the next live batch (capture-plan.ts, uploader.ts). A job's
//   exact plan and body are written before its first send and kept until it is settled. While the Start is live, a
//   job whose outcome is unknown is sent again as the same key and body; a later refusal never makes it known.
// - The host lost while the Start is live is started again without consent (at most twice); sending continues only
//   if the stream is still live.
// - Stop (the user's, or the session ending any other way) latches at once: nothing new is planned. The job in
//   flight may finish for a bounded time, then is cancelled (and stays in doubt). One Stop is written, then sent;
//   the state is read back; the host is ended.
// - The service stopping or withdrawing the stream ends the local capture too (through the app's own end).
// - After the app restarts, each stream not known to be ended is reconciled by a host started without consent:
//   reads and control only (the registration replayed under its own key, the state, a Stop). Nothing is sent
//   again, not even an unknown job; a grant still pending is abandoned, never registered.
// The coordination record (userData/capture-host/coordination.json) holds identities, registrations, keys, the exact
// bodies of unsettled jobs and every outcome; never a token, the DSN or pixels. A record that cannot be read is left
// untouched, and the link stays off.
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { planNext, type StreamFacts } from '../shared/capture-plan.ts';
import type { IngressPlan, SourceRef } from '../shared/frame-ingress.ts';
import { startHost, STARTUP_FORMAT, type Host, type HostLaunch, type HostOptions, type StartupRecord } from './capture-host.ts';
import { errorCode, loopbackTransport, type Transport } from './loopback-http.ts';
import { uploadRetained, type UploadAuthority, type UploadResult } from './uploader.ts';

// ---- configuration ------------------------------------------------------------------------------------------
export type LinkConfig = { readonly launch: HostLaunch; readonly dsn_file: string };
const CONFIG_FORMAT = 'lc-windows-dev-capture-host/v1';
const isText = (v: unknown, max = 4096): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\0\r\n]/.test(v);

/**
 * The development configuration named by LC_DEV_CAPTURE_HOST, or null when it is not set (the link is off). It holds
 * only launch facts and the path of the test database's DSN file (read at each host start, never copied).
 */
export function readLinkConfig(env: Readonly<Record<string, string | undefined>>, read: (path: string) => string = (p) => readFileSync(p, 'utf8')): LinkConfig | { error: string } | null {
  const path = env['LC_DEV_CAPTURE_HOST'];
  if (!path) return null;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(read(path)) as Record<string, unknown>;
  } catch {
    return { error: 'the development capture host configuration could not be read' };
  }
  const l = v?.['launch'] as Record<string, unknown> | undefined;
  if (v?.['format'] !== CONFIG_FORMAT || !isText(v['dsn_file']) || typeof l !== 'object' || l === null) return { error: 'the development capture host configuration is not valid' };
  if (l['kind'] === 'wsl' && isText(l['distribution'], 64) && isText(l['user'], 64) && isText(l['cd']) && isText(l['python'])) {
    return { launch: { kind: 'wsl', distribution: l['distribution'], user: l['user'], cd: l['cd'], python: l['python'] }, dsn_file: v['dsn_file'] };
  }
  if (l['kind'] === 'fifo' && isText(l['python']) && isText(l['cwd']) && (l['module'] === undefined || isText(l['module'], 128))) {
    return { launch: { kind: 'fifo', python: l['python'], cwd: l['cwd'], ...(l['module'] ? { module: l['module'] as string } : {}) }, dsn_file: v['dsn_file'] };
  }
  return { error: 'the development capture host configuration is not valid' };
}

/**
 * The DSN for the host, from the test database's DSN file: only lc_p0_test, one local endpoint (a socket directory or
 * a loopback address), no indirect target; with the test runner's connection and statement bounds. Null if refused.
 */
export function testDatabaseDsn(text: string): string | null {
  const values = new Map<string, string>();
  const re = /\s*([A-Za-z_]+)\s*=\s*('(?:[^'\\]|\\.)*'|[^\s']+)/y;
  let at = 0;
  const trimmed = text.trim();
  while (at < trimmed.length) {
    re.lastIndex = at;
    const m = re.exec(trimmed);
    if (!m) return null;
    const raw = m[2]!;
    values.set(m[1]!, raw.startsWith("'") ? raw.slice(1, -1).replace(/\\(.)/g, '$1') : raw);
    at = re.lastIndex;
  }
  const host = values.get('host') ?? '';
  const port = values.get('port') ?? '5432';
  if (values.get('dbname') !== 'lc_p0_test' || values.has('service') || values.has('hostaddr') || values.has('password')) return null;
  if (!host || host.includes(',') || !(host.startsWith('/') || ['127.0.0.1', '::1', 'localhost'].includes(host))) return null;
  if (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) return null;
  const user = values.get('user');
  const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return [`host=${q(host)}`, `port=${port}`, 'dbname=lc_p0_test', ...(user ? [`user=${q(user)}`] : []), 'connect_timeout=5', `options=${q('-c statement_timeout=15000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000')}`].join(' ');
}

// ---- the coordination record ------------------------------------------------------------------------------------
type Registration = {
  contract_version: '0.2.1';
  device_id: string;
  session_id: string;
  stream_id: string;
  authorization_generation: number;
  membership_revision: number;
  continuity: { kind: 'initial' } | { kind: 'restart'; previous_stream_id: string; gap: 'unknown' };
};
type StreamState = { revision: number; state: 'live' | 'stopped' | 'withdrawn'; pre_stop_sequence: number | null; read_at: string };
export type JobRecord = {
  key: string;
  from: number;
  through: number;
  records: number;
  status: 'sending' | 'unknown' | 'not_sent' | 'committed' | 'refused' | 'unsendable';
  /** The exact plan and body, kept while the job is not settled. */
  plan?: IngressPlan;
  body?: string;
  body_sha256?: string;
  originals: string[];
  in_doubt?: string;
  http_status?: number;
  error?: string;
  reason?: string;
  ack_sha256?: string;
  /** Refusals that came after the job was in doubt: they do not make its outcome known. */
  later?: string[];
  /** In doubt, and it cannot be sent again from this device as recorded (it stays not known; later jobs go on). */
  stuck?: boolean;
};
type StopRecord = { key: string; body: unknown; outcome: 'written' | 'stopped' | 'unknown' | 'refused'; http_status?: number; error?: string };
export type StreamRecord = {
  capture_session: string;
  capture_dir: string;
  stream_id: string;
  source_id: string;
  registration: Registration;
  registration_key: string;
  /** requested_unknown: asked with fresh consent, no READY seen (a grant may exist). */
  grant: 'requested_unknown' | 'pending' | 'consumed' | 'abandoned';
  registered: boolean;
  /** A registration was sent (so it may have committed, even without an answer). */
  registration_sent?: boolean;
  state: StreamState | null;
  source: SourceRef | null;
  planned_through: number;
  jobs: JobRecord[];
  stops: StopRecord[];
  /** Known end: stopped or withdrawn (read back), abandoned (never registered). Null while not known. */
  final: null | 'stopped' | 'withdrawn' | 'abandoned';
  notes: string[];
};
export type CoordinationRecord = {
  format: 'lc-windows-capture-link/v1';
  actor: { user_id: string; device_id: string; session_id: string; producer_id: string };
  /** The latest stream whose registration committed (continuity of the next). */
  last_registered_stream: string | null;
  streams: StreamRecord[];
};
const RECORD_FORMAT = 'lc-windows-capture-link/v1';
const FAULT = 'the capture link record could not be written, so further sends to the local test capture service have stopped';
const hex = (n: number): string => randomBytes(n).toString('hex');
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

// ---- status -------------------------------------------------------------------------------------------------
export type LinkStatus =
  | { readonly mode: 'off' }
  | { readonly mode: 'unavailable'; readonly reason: string }
  | {
      readonly mode: 'development';
      /** What this app's capture link is doing now. `stalled`: live, but storage is not confirmed now (the detail says why). */
      readonly state: 'idle' | 'connecting' | 'sending' | 'stalled' | 'offline' | 'stopping' | 'stopped' | 'not connected' | 'ended by the service' | 'reconciling';
      readonly stored: number;
      readonly unknown: number;
      readonly refused: number;
      readonly not_sent: number;
      readonly detail: string | null;
      /** Earlier streams whose end is not known. */
      readonly earlier_unknown: number;
      /** The record could not be written: nothing further is sent in this run (the detail says so); the counts stay. */
      readonly sends_stopped: boolean;
      /**
       * A send is out and not yet answered (said before the wait begins): whether its records are stored is not
       * known until it is. They are counted as not known meanwhile, never as stored and never as not stored.
       */
      readonly awaiting: boolean;
      /**
       * Storage is confirmed as far as is known: a Start's stream is live on the service, not stopping, no send is out
       * (`awaiting`), and none has gone unconfirmed since the last one that was answered (a queue with nothing left
       * to send is not an answer). Nothing the app says of storage goes beyond this, or the mere configuration.
       */
      readonly storing: boolean;
    };

export type LinkOptions = {
  readonly userData: string;
  readonly config: LinkConfig;
  readonly notify: (s: LinkStatus) => void;
  /** Ends the app's capture session `captureSession` the normal way (the service ended its stream). */
  readonly endCapture: (captureSession: string, reason: string) => void;
  readonly transport?: Transport;
  readonly host?: HostOptions;
  readonly readDsn?: (path: string) => string;
  /** Bounds (ms): the job in flight at a Stop; a retry pause while unknown. */
  readonly stop_wait_ms?: number;
  readonly retry_ms?: number;
  /** For tests: how long a bearer lives (default 12 h). */
  readonly token_life_ms?: number;
};

type Active = {
  /** The app's capture session (known at once; its stream record is made once the stream before it has settled). */
  readonly capture_session: string;
  readonly capture_dir: string;
  rec: StreamRecord | null;
  host: Host | null;
  hostEnded: boolean;
  authority: UploadAuthority | null;
  live: boolean;
  stopping: boolean;
  validBytes: number;
  runner: Promise<void> | null;
  again: boolean;
  controller: AbortController;
  reconnects: number;
  state: Extract<LinkStatus, { mode: 'development' }>['state'];
  detail: string | null;
  /** The connection being made (a Stop waits for it). */
  connecting: Promise<void> | null;
  /** The Stop in progress or done. */
  stopped: Promise<void> | null;
  /** Whether a startup record ever reached a host for this stream (a grant may exist from then on). */
  asked: boolean;
  /** A send's storage was not confirmed, and none has been answered since: it stays "not confirmed" until one is. */
  unanswered: boolean;
  /** A send is out, not yet answered. */
  awaiting: boolean;
};

const CONTROL = { contract_version: '0.2.1' } as const;
const SCOPES = ['process:capture', 'process:control', 'sources:read', 'sources:write'];
const CAPABILITIES = ['process.capture.v0.2', 'process.control.v0.2.1', 'process.ingress.v0.2.4', 'process.windows-ingress.v0.2.10'];
const TOKEN_LIFE_MS = 12 * 60 * 60 * 1000;
/** A bearer this close to its expiry is renewed (a host started again without consent) before a Stop is sent. */
const RENEW_BEFORE_MS = 60_000;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
// ---- reading the record back: every field that status, recovery and the Stop use is checked, with its bindings to
// the actor and stream; anything else and the whole record is treated as unreadable (left as it is, never used).
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const isCount = (v: unknown, min: number): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const isSha = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const isTexts = (v: unknown): v is string[] => Array.isArray(v) && v.every((t) => typeof t === 'string');
const hasKeys = (v: Record<string, unknown>, keys: string): boolean => Object.keys(v).sort().join() === keys;
/** An optional member: absent, or as `ok` says. */
const maybe = (v: Record<string, unknown>, key: string, ok: (x: unknown) => boolean): boolean => !(key in v) || ok(v[key]);
const isHttpStatus = (v: unknown): boolean => isCount(v, 100) && v <= 599;

function validState(v: unknown): boolean {
  return isObject(v) && hasKeys(v, 'pre_stop_sequence,read_at,revision,state') && isCount(v['revision'], 1) && ['live', 'stopped', 'withdrawn'].includes(v['state'] as string) && (v['pre_stop_sequence'] === null || isCount(v['pre_stop_sequence'], 0)) && typeof v['read_at'] === 'string';
}
function validRegistration(v: unknown, s: Record<string, unknown>, actor: Record<string, unknown>): boolean {
  if (!isObject(v) || !hasKeys(v, 'authorization_generation,continuity,contract_version,device_id,membership_revision,session_id,stream_id')) return false;
  const c = v['continuity'];
  const continuity = isObject(c) && ((hasKeys(c, 'kind') && c['kind'] === 'initial') || (hasKeys(c, 'gap,kind,previous_stream_id') && c['kind'] === 'restart' && isId(c['previous_stream_id']) && c['gap'] === 'unknown'));
  return continuity && v['contract_version'] === '0.2.1' && v['device_id'] === actor['device_id'] && v['session_id'] === actor['session_id'] && v['stream_id'] === s['stream_id'] && isCount(v['authorization_generation'], 1) && isCount(v['membership_revision'], 1);
}
function validJob(j: unknown, s: Record<string, unknown>): boolean {
  if (!isObject(j) || !isCount(j['from'], 1) || !isCount(j['through'], j['from'] as number) || (j['through'] as number) > (s['planned_through'] as number)) return false;
  const status = j['status'] as string;
  if (!['sending', 'unknown', 'not_sent', 'committed', 'refused', 'unsendable'].includes(status) || !isTexts(j['originals'])) return false;
  const common = maybe(j, 'in_doubt', (x) => typeof x === 'string') && maybe(j, 'http_status', isHttpStatus) && maybe(j, 'error', (x) => typeof x === 'string') && maybe(j, 'reason', (x) => typeof x === 'string') && maybe(j, 'ack_sha256', isSha) && maybe(j, 'later', isTexts) && maybe(j, 'stuck', (x) => typeof x === 'boolean');
  if (!common) return false;
  if (status === 'unsendable') return j['key'] === `unsendable-${j['from']}` && j['through'] === j['from'] && j['records'] === 1 && !('plan' in j) && !('body' in j);
  // A batch: its key is its lines' key; its exact plan and body (kept while not settled) are this stream's and bound.
  if (j['key'] !== `${s['source_id']}.b${j['from']}-${j['through']}` || !isCount(j['records'], 1) || (j['records'] as number) > (j['through'] as number) - (j['from'] as number) + 1 || !isSha(j['body_sha256'])) return false;
  if (['sending', 'unknown', 'not_sent'].includes(status) && !('plan' in j && 'body' in j)) return false;
  if (('body' in j) !== ('plan' in j)) return false;
  if (!('plan' in j)) return true;
  const p = j['plan'];
  const reg = s['registration'] as Record<string, unknown>;
  return isObject(p) && typeof j['body'] === 'string' && sha(j['body']) === j['body_sha256'] && p['idempotency_key'] === j['key'] && p['batch_id'] === j['key'] && p['stream_id'] === s['stream_id'] && p['device_id'] === reg['device_id'] && p['session_id'] === reg['session_id'] && p['capture_session'] === s['capture_session'] && JSON.stringify(p['source']) === JSON.stringify(s['source']) && Array.isArray(p['entries']) && p['entries'].length === j['records'];
}
function validStop(v: unknown, index: number, s: Record<string, unknown>): boolean {
  if (!isObject(v) || v['key'] !== `${s['stream_id']}.stop.${index + 1}` || !['written', 'stopped', 'unknown', 'refused'].includes(v['outcome'] as string)) return false;
  if (!maybe(v, 'http_status', isHttpStatus) || !maybe(v, 'error', (x) => typeof x === 'string')) return false;
  const b = v['body'];
  const reg = s['registration'] as Record<string, unknown>;
  const action = isObject(b) ? b['action'] : null;
  return isObject(b) && hasKeys(b, 'action,contract_version,device_id,expected_revision,session_id,stream_id') && b['contract_version'] === '0.2.1' && b['device_id'] === reg['device_id'] && b['session_id'] === reg['session_id'] && b['stream_id'] === s['stream_id'] && isCount(b['expected_revision'], 1) && isObject(action) && hasKeys(action, 'kind,pre_stop_sequence') && action['kind'] === 'stop' && action['pre_stop_sequence'] === null;
}
function validStream(v: unknown, actor: Record<string, unknown>): boolean {
  if (!isObject(v) || !isId(v['stream_id']) || !isId(v['source_id']) || !isText(v['capture_session'], 256) || !isText(v['capture_dir'])) return false;
  if (!validRegistration(v['registration'], v, actor) || v['registration_key'] !== `${v['stream_id']}.register`) return false;
  if (!['requested_unknown', 'pending', 'consumed', 'abandoned'].includes(v['grant'] as string) || typeof v['registered'] !== 'boolean' || !maybe(v, 'registration_sent', (x) => typeof x === 'boolean')) return false;
  if (!(v['state'] === null || validState(v['state']))) return false;
  const src = v['source'];
  if (!(src === null || (isObject(src) && hasKeys(src, 'source_id,source_version,user_id') && src['user_id'] === actor['user_id'] && src['source_id'] === v['source_id'] && src['source_version'] === 1))) return false;
  // A required end: its absence is not taken as "not ended" or "ended".
  if (!('final' in v) || ![null, 'stopped', 'withdrawn', 'abandoned'].includes(v['final'] as string | null)) return false;
  if (!isCount(v['planned_through'], 0) || !isTexts(v['notes']) || !Array.isArray(v['jobs']) || !Array.isArray(v['stops'])) return false;
  return v['jobs'].every((j) => validJob(j, v)) && v['stops'].every((x, i) => validStop(x, i, v));
}
/** The coordination record as read back, if every field it is used for is well formed and bound (else null). */
function validRecord(v: unknown): CoordinationRecord | null {
  if (!isObject(v) || v['format'] !== RECORD_FORMAT || !isObject(v['actor']) || !Array.isArray(v['streams'])) return null;
  const actor = v['actor'];
  if (!hasKeys(actor, 'device_id,producer_id,session_id,user_id') || !['user_id', 'device_id', 'session_id', 'producer_id'].every((k) => isId(actor[k]))) return null;
  if (!(v['last_registered_stream'] === null || isId(v['last_registered_stream']))) return null;
  const streams = v['streams'];
  if (!streams.every((s) => validStream(s, actor))) return null;
  const ids = streams.flatMap((s) => [s['stream_id'], s['source_id']]);
  return new Set(ids).size === ids.length ? (v as CoordinationRecord) : null;
}
type Launched = { host: Host; authority: UploadAuthority } | { failed: string; delivered: boolean; start_status?: 'pending' | 'consumed' };

export class CaptureLink {
  private record: CoordinationRecord | null = null;
  /** The record cannot be used (unreadable, or lost): the link is off and asks for nothing. */
  private broken: string | null = null;
  /** The record could not be written: nothing more is sent (what needs writing first is not done). */
  private fault: string | null = null;
  /** The record is on disk (read at start, or written since): its folder then marks that the link has been used. */
  private written = false;
  private active: Active | null = null;
  /** How the last stream ended, shown until the next Start. */
  private last: { state: Active['state']; detail: string | null } | null = null;
  private reconciling: Promise<void> = Promise.resolve();
  private readonly file: string;
  private readonly transport: Transport;
  private readonly o: LinkOptions;

  constructor(o: LinkOptions) {
    this.o = o;
    this.file = join(o.userData, 'capture-host', 'coordination.json');
    this.transport = o.transport ?? loopbackTransport;
    this.load();
  }

  // ---- the record ----------------------------------------------------------------------------------------------
  private load(): void {
    if (!existsSync(this.file)) {
      // Its folder is made only when the record is first written: a folder without it means the record was lost.
      if (existsSync(dirname(this.file))) this.broken = 'the capture link record is missing, though the link has been used; nothing is asked for without it, and development capture storage is off';
      return;
    }
    try {
      const v = validRecord(JSON.parse(readFileSync(this.file, 'utf8')));
      if (!v) throw new Error('format');
      this.record = v;
      this.written = true;
    } catch {
      // Left untouched: nothing is written over it, and no grant is asked for without it.
      this.broken = 'the capture link record could not be read; it is left as it is, and development capture storage is off';
    }
  }
  /**
   * Written whole (every byte, however many writes that takes) to a temporary file, flushed, then renamed over the
   * record. False (and the link at fault) if not: the record before stays as it was, and nothing waiting on this
   * write is sent.
   */
  private save(): boolean {
    if (!this.record || this.broken) return false;
    const tmp = `${this.file}.${process.pid}.tmp`;
    try {
      const dir = dirname(this.file);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const bytes = Buffer.from(`${JSON.stringify(this.record)}\n`, 'utf8');
      const fd = openSync(tmp, 'w', 0o600);
      try {
        for (let at = 0; at < bytes.length; ) {
          const n = writeSync(fd, bytes, at, bytes.length - at);
          if (!(n > 0)) throw new Error('the record write made no progress');
          at += n;
        }
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(tmp, this.file);
      this.written = true;
      return true;
    } catch {
      try {
        unlinkSync(tmp);
      } catch {
        // not made, or already gone
      }
      // Never written: its folder is not left behind to be taken, at the next start, for a used link's lost record.
      if (!this.written) {
        try {
          rmdirSync(dirname(this.file));
        } catch {
          // not empty, or not made
        }
      }
      this.fault ??= FAULT;
      const a = this.active;
      if (a && !a.stopping) {
        a.live = false;
        a.state = 'not connected';
        a.detail = null;
        this.o.notify(this.status());
      }
      return false;
    }
  }
  /** The record, created with a new actor on the first Start (never while an unreadable or lost one exists). */
  private ensureRecord(): CoordinationRecord | null {
    if (this.broken) return null;
    this.record ??= { format: RECORD_FORMAT, actor: { user_id: `lc-windows-http-${hex(16)}`, device_id: `windows-${hex(8)}`, session_id: `learning-${hex(8)}`, producer_id: `windows-app-${hex(8)}` }, last_registered_stream: null, streams: [] };
    return this.record;
  }
  /** The newest stream whose registration committed: the predecessor a new registration must name. */
  private relineage(): void {
    if (!this.record) return;
    this.record.last_registered_stream = [...this.record.streams].reverse().find((s) => s.registered)?.stream_id ?? null;
  }
  /** A copy of the record as written (for checks and evidence; it holds no token or DSN). */
  snapshot(): CoordinationRecord | null {
    return this.record ? (JSON.parse(JSON.stringify(this.record)) as CoordinationRecord) : null;
  }

  // ---- status --------------------------------------------------------------------------------------------------
  status(): LinkStatus {
    if (this.broken) return { mode: 'unavailable', reason: this.broken };
    const a = this.active;
    // A fault before anything was ever recorded: nothing was sent. After that, what is known of earlier sends stays.
    if (this.fault && !this.record?.streams.length) return { mode: 'unavailable', reason: this.fault };
    const rec = a ? a.rec : this.record?.streams.at(-1) ?? null;
    const count = (s: JobRecord['status'][]): number => (rec?.jobs ?? []).filter((j) => s.includes(j.status)).reduce((n, j) => n + j.records, 0);
    const earlier = (this.record?.streams ?? []).filter((s) => s.final === null && s !== a?.rec).length;
    const stuck = (rec?.jobs ?? []).filter((j) => j.stuck).reduce((n, j) => n + j.records, 0);
    const detail = a ? a.detail : this.last ? this.last.detail : rec ? rec.notes.at(-1) ?? null : null;
    return {
      mode: 'development',
      state: a ? a.state : this.last ? this.last.state : rec ? (rec.final ? 'stopped' : 'not connected') : 'idle',
      stored: count(['committed']),
      unknown: count(['unknown', 'sending']),
      refused: count(['refused']),
      not_sent: count(['not_sent', 'unsendable']),
      detail: [this.fault, stuck ? `${stuck} record(s) in doubt cannot be sent again from this device; whether they were stored stays not known` : null, detail].filter(Boolean).join('; ') || null,
      earlier_unknown: earlier,
      sends_stopped: this.fault !== null,
      awaiting: a !== null && a.awaiting,
      storing: a !== null && a.live && !a.stopping && this.fault === null && a.state === 'sending' && !a.awaiting,
    };
  }
  private say(a: Active, state: Active['state'], detail: string | null = a.detail): void {
    a.state = state;
    a.detail = detail;
    this.o.notify(this.status());
  }
  private note(rec: StreamRecord | null, text: string): void {
    if (!rec) return;
    rec.notes.push(text);
    this.save();
  }

  // ---- host and requests ---------------------------------------------------------------------------------------
  private async launch(rec: StreamRecord, fresh: boolean): Promise<Launched> {
    let dsn: string | null;
    try {
      dsn = testDatabaseDsn((this.o.readDsn ?? ((p: string) => readFileSync(p, 'utf8')))(this.o.config.dsn_file));
    } catch {
      return { failed: 'the test database DSN file could not be read', delivered: false };
    }
    if (!dsn) return { failed: 'the DSN file does not name the dedicated local test database (lc_p0_test)', delivered: false };
    const actor = this.record!.actor;
    const token = hex(32);
    const expires_at = new Date(Date.now() + (this.o.token_life_ms ?? TOKEN_LIFE_MS)).toISOString();
    const startup: StartupRecord = {
      format: STARTUP_FORMAT, port: 0, database_dsn: dsn, ...actor, registration: rec.registration, token, expires_at,
      scopes: SCOPES, capabilities: CAPABILITIES, fresh_consent: fresh, producer_profile: 'desktop_pixels',
      enable_raw_ingress: false, enable_desktop_ingress: false, enable_windows_ingress: true, enable_macos_ingress: false,
    };
    const started = await startHost(this.o.config.launch, startup, { transport: this.transport, ...this.o.host });
    if (!started.ok) return { failed: started.reason, delivered: started.delivered, ...(started.start_status ? { start_status: started.start_status } : {}) };
    const inc = { device_id: rec.registration.device_id, session_id: rec.registration.session_id, stream_id: rec.stream_id };
    return { host: started.host, authority: { origin: started.host.origin, token, expires_at, owner: rec.source ?? { user_id: actor.user_id, source_id: rec.source_id, source_version: 1 }, incarnation: inc } };
  }
  /** One control or source request; the answer's JSON, a typed error code, or unknown (it may have arrived). */
  private async call(authority: UploadAuthority, method: 'GET' | 'PUT' | 'POST', path: string, body: unknown, key?: string): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; status: number; error: string } | { ok: false; unknown: true; notSent: boolean }> {
    try {
      const res = await this.transport({
        method,
        url: `${authority.origin}${path}`,
        headers: { Authorization: `Bearer ${authority.token}`, ...(body === null ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...(key ? { 'Idempotency-Key': key } : {}) },
        body: body === null ? null : JSON.stringify(body),
        timeout_ms: 30_000,
      });
      let value: unknown = null;
      try {
        value = JSON.parse(res.text);
      } catch {
        value = null;
      }
      const v = value as Record<string, unknown> | null;
      if (res.status === 200 && v && typeof v === 'object') return { ok: true, value: v };
      const error = v && typeof v['error'] === 'string' && /^[a-z_]{1,40}$/.test(v['error']) ? v['error'] : 'other';
      if (res.status === 503) return { ok: false, unknown: true, notSent: false };
      return { ok: false, status: res.status, error };
    } catch (error) {
      return { ok: false, unknown: true, notSent: errorCode(error) === 'ECONNREFUSED' };
    }
  }
  /** The stream's state from an answer, only as the record would read it back (else null: not known). */
  private stateOf(v: Record<string, unknown>, rec: StreamRecord): StreamState | null {
    if (v['stream_id'] !== rec.stream_id) return null;
    const state = { revision: v['revision'], state: v['state'], pre_stop_sequence: v['pre_stop_sequence'] ?? null, read_at: new Date().toISOString() };
    return validState(state) ? (state as StreamState) : null;
  }
  /** The registration, under its own key (a replay answers the stream's current state); bounded while unknown. */
  private async register(authority: UploadAuthority, rec: StreamRecord): Promise<StreamState | { refused: string } | { unknown: string }> {
    for (let n = 0; n < 3; n++) {
      const r = await this.call(authority, 'POST', '/v2/process/streams', rec.registration, rec.registration_key);
      if (r.ok) return this.stateOf(r.value, rec) ?? { unknown: 'the registration answer is not this stream\'s state' };
      if (!('unknown' in r)) return { refused: `the registration was refused (${r.status} ${r.error})` };
      await sleep(this.o.retry_ms ?? 1000);
    }
    return { unknown: 'the registration was sent without an answer' };
  }
  /** The stream's current state (read only): its state, 'absent' (never registered), or null (not known). */
  private async readState(authority: UploadAuthority, rec: StreamRecord): Promise<StreamState | 'absent' | null> {
    const r = await this.call(authority, 'GET', `/v2/process/streams/${rec.stream_id}`, null);
    if (r.ok) return this.stateOf(r.value, rec);
    return !('unknown' in r) && r.status === 404 ? 'absent' : null;
  }
  private registeredAs(rec: StreamRecord, state: StreamState): void {
    rec.grant = 'consumed';
    rec.registered = true;
    rec.state = state;
    this.relineage();
  }

  // ---- Start ---------------------------------------------------------------------------------------------------
  /** At an explicit user Start of capture session `captureSession` (retained under `captureDir`). Never throws. */
  begin(captureSession: string, captureDir: string): void {
    try {
      const before = this.active;
      if (this.broken || this.fault || (before && !before.stopping)) return void this.o.notify(this.status());
      const a: Active = { capture_session: captureSession, capture_dir: captureDir, rec: null, host: null, hostEnded: false, authority: null, live: false, stopping: false, validBytes: 0, runner: null, again: false, controller: new AbortController(), reconnects: 0, state: 'connecting', detail: null, connecting: null, stopped: null, asked: false, unanswered: false, awaiting: false };
      this.active = a;
      this.last = null;
      this.o.notify(this.status());
      a.connecting = this.startStream(a, before).catch(() => this.failed(a));
    } catch {
      this.fault ??= 'the capture link could not start';
      this.o.notify(this.status());
    }
  }
  /** After the stream before has settled: the new stream is recorded (its continuity from that), then connected. */
  private async startStream(a: Active, before: Active | null): Promise<void> {
    await this.reconciling;
    if (before?.stopped) await before.stopped;
    // A stream of this run not known to be ended is ended first (reads and control only), so the lineage is settled.
    for (const rec of this.record?.streams ?? []) if (rec.final === null) await this.reconcileOne(rec);
    if (a.stopping) return; // stopped before anything was asked for: no stream at all
    const record = this.ensureRecord();
    if (!record) return this.say(a, 'not connected', this.broken);
    this.relineage();
    const stream_id = `stream-${hex(12)}`;
    const previous = record.last_registered_stream;
    const rec: StreamRecord = {
      capture_session: a.capture_session,
      capture_dir: a.capture_dir,
      stream_id,
      source_id: `src-${hex(12)}`,
      registration: { contract_version: '0.2.1', device_id: record.actor.device_id, session_id: record.actor.session_id, stream_id, authorization_generation: 1, membership_revision: 1, continuity: previous ? { kind: 'restart', previous_stream_id: previous, gap: 'unknown' } : { kind: 'initial' } },
      registration_key: `${stream_id}.register`,
      grant: 'requested_unknown',
      registered: false,
      state: null,
      source: null,
      planned_through: 0,
      jobs: [],
      stops: [],
      final: null,
      notes: [],
    };
    record.streams.push(rec);
    if (!this.save()) {
      record.streams.pop(); // not written: the host is not asked for anything
      return this.say(a, 'not connected', null);
    }
    a.rec = rec;
    await this.connect(a, true);
  }
  /** Starts the host (fresh consent only at the Start), registers, creates the source; then sending may run. */
  private async connect(a: Active, fresh: boolean): Promise<void> {
    const rec = a.rec!;
    if (this.fault) return this.say(a, 'not connected', null); // nothing more is sent: no host is started for it
    this.say(a, 'connecting', null);
    const got = await this.launch(rec, fresh);
    if ('failed' in got) {
      if (got.delivered) a.asked = true;
      if (got.start_status === 'pending' && !rec.registered) rec.grant = 'pending'; // READY said so; never registered
      this.note(rec, `not connected: ${got.failed}`);
      return this.say(a, 'not connected', got.failed);
    }
    a.asked = true;
    this.adopt(a, got);
    if (got.host.start_status === 'pending') {
      rec.grant = 'pending';
      if (!this.save() || !fresh || a.stopping) return; // never registered without the user's Start, nor after a Stop
    }
    if (!rec.registered) {
      rec.registration_sent = true;
      if (!this.save()) return this.say(a, 'not connected', null); // written before it is sent
    }
    const state = await this.register(got.authority, rec);
    if (!('revision' in state)) {
      this.note(rec, 'refused' in state ? state.refused : state.unknown);
      return this.say(a, 'not connected', 'refused' in state ? state.refused : state.unknown);
    }
    this.registeredAs(rec, state);
    if (!this.save()) return this.say(a, 'not connected', null);
    if (state.state !== 'live') return this.serviceEnded(a, state);
    if (a.stopping) return; // the Stop follows; nothing is created or sent after it
    if (!rec.source) {
      const r = await this.call(got.authority, 'PUT', `/v2/process/display-sources/${rec.source_id}`, { contract_version: '0.2.4', source_id: rec.source_id, stream_id: rec.stream_id, project_id: null, source_timezone: 'UTC' });
      if (!r.ok || r.value['source_id'] !== rec.source_id || r.value['user_id'] !== this.record!.actor.user_id || r.value['source_version'] !== 1) {
        const why = r.ok ? 'the display source answer is not this source' : 'unknown' in r ? 'the display source was sent without an answer' : `the display source was refused (${r.status} ${r.error})`;
        this.note(rec, why);
        return this.say(a, 'not connected', why);
      }
      rec.source = { user_id: r.value['user_id'] as string, source_id: rec.source_id, source_version: 1 };
      if (!this.save()) return this.say(a, 'not connected', null);
    }
    a.authority = { ...got.authority, owner: rec.source };
    if (a.stopping) return;
    a.live = true;
    this.rest(a);
    this.kick(a);
  }
  /** Takes a started host as this stream's, watching for its loss. */
  private adopt(a: Active, got: { host: Host; authority: UploadAuthority }): void {
    a.host = got.host;
    a.hostEnded = false;
    a.authority = a.rec?.source ? { ...got.authority, owner: a.rec.source } : got.authority;
    void got.host.exited.then(() => {
      if (a.host === got.host) a.hostEnded = true;
      this.hostLost(a, got.host);
    });
  }
  /** An unexpected local error: nothing more is sent; the Stop still ends the host. */
  private failed(a: Active): void {
    a.live = false;
    this.note(a.rec, 'an unexpected local error stopped the capture link');
    this.say(a, 'not connected', 'an unexpected local error stopped the capture link');
  }

  // ---- sending -------------------------------------------------------------------------------------------------
  /** After each successful append to capture session `captureSession`'s manifest. */
  appended(captureSession: string, validBytes: number): void {
    const a = this.active;
    if (!a || a.capture_session !== captureSession) return;
    a.validBytes = validBytes;
    this.kick(a);
  }
  private kick(a: Active): void {
    if (!a.live || a.stopping || this.fault) return;
    if (a.runner) return void (a.again = true);
    a.runner = (async () => {
      try {
        do {
          a.again = false;
          await this.run(a);
        } while (a.again && a.live && !a.stopping && !this.fault);
      } catch {
        this.failed(a);
      } finally {
        a.runner = null;
      }
    })();
  }
  /**
   * Nothing to send now, or connected again. Neither is an answered send: after a send whose storage is not
   * confirmed (its job then set aside, say), the stream stays "not confirmed" until a later send is answered.
   */
  private rest(a: Active): void {
    if (a.unanswered) this.say(a, 'stalled', 'storage of the last send is not confirmed; it stays not confirmed until the service confirms a later send');
    else this.say(a, 'sending', null);
  }
  private facts(rec: StreamRecord): StreamFacts {
    return { device_id: rec.registration.device_id, session_id: rec.registration.session_id, stream_id: rec.stream_id, source: rec.source!, capture_session: rec.capture_session };
  }
  /** Sends what is retained: first the oldest unsettled job (the same bytes), then the next lines, in order. */
  private async run(a: Active): Promise<void> {
    const rec = a.rec!;
    while (a.live && !a.stopping && !this.fault) {
      const open = rec.jobs.find((j) => (j.status === 'sending' || j.status === 'unknown' || j.status === 'not_sent') && !j.stuck);
      if (open) {
        const settled = await this.send(a, open);
        if (!settled) {
          if (!a.live || a.stopping || this.fault) return;
          if (!open.stuck) await sleep(this.o.retry_ms ?? 1000);
        }
        continue;
      }
      if (a.validBytes === 0) return this.rest(a); // nothing retained yet (the manifest is made with its first line)
      let text: string;
      try {
        text = readFileSync(join(rec.capture_dir, 'manifest.jsonl')).subarray(0, a.validBytes).toString('utf8');
      } catch {
        return this.say(a, 'stalled', 'the retention manifest could not be read; it is read again at the next retained frame');
      }
      let planned;
      try {
        planned = planNext(text, this.facts(rec), rec.planned_through);
      } catch {
        a.live = false;
        this.note(rec, 'the retention manifest is not of this stream\'s capture session; sending stopped');
        return this.say(a, 'not connected', 'the retention manifest is not of this stream\'s capture session');
      }
      if (planned.kind === 'none' || planned.kind === 'ended') return this.rest(a);
      if (planned.kind === 'unsendable') {
        rec.jobs.push({ key: `unsendable-${planned.line}`, from: planned.line, through: planned.line, records: 1, status: 'unsendable', originals: [], reason: planned.reason });
        rec.planned_through = planned.line;
        if (!this.save()) return;
        continue;
      }
      const job: JobRecord = { key: planned.plan.idempotency_key, from: planned.from_line, through: planned.through_line, records: planned.plan.entries.length, status: 'sending', plan: planned.plan, body: planned.prepared.body, body_sha256: sha(planned.prepared.body), originals: [] };
      rec.jobs.push(job);
      const through = rec.planned_through;
      rec.planned_through = planned.through_line;
      if (!this.save()) {
        // Not written: not sent either.
        rec.jobs.pop();
        rec.planned_through = through;
        return this.say(a, 'not connected', null);
      }
      await this.send(a, job);
    }
  }
  /** One upload of `job` (its exact plan and body). Returns whether it is settled (committed, refused). */
  private async send(a: Active, job: JobRecord): Promise<boolean> {
    const wasInDoubt = job.status === 'unknown';
    // A job known not sent is being sent now: written as that before it leaves (as its first send was), so that it
    // is counted as not known while it is out, and after a crash; each outcome below sets it again.
    if (job.status === 'not_sent') {
      job.status = 'sending';
      if (!this.save()) {
        // Not written: not sent. The fault was just said with this job as being sent; it is said again as it is.
        job.status = 'not_sent';
        this.o.notify(this.status());
        return false;
      }
    }
    // Said before the wait, which can be long (a service that holds its connection and does not answer): from here
    // until an answer, this job's storage is pending, and nothing says frames are being stored.
    a.awaiting = true;
    this.o.notify(this.status());
    let result: UploadResult;
    try {
      result = await uploadRetained(a.authority!, { capture_dir: a.rec!.capture_dir, plan: job.plan!, prepared: { idempotency_key: job.key, body: job.body!, request: JSON.parse(job.body!), unrepresented: [] } }, { signal: a.controller.signal, transport: this.transport, attempts: 3, pause_ms: 500 });
    } finally {
      a.awaiting = false; // each outcome below says the status again
    }
    job.originals = [...new Set([...job.originals, ...result.originals])];
    if (result.status === 'committed') {
      Object.assign(job, { status: 'committed', ack_sha256: sha(JSON.stringify(result.ack)) });
      delete job.plan;
      delete job.body;
      delete job.in_doubt;
      this.save();
      a.unanswered = false; // answered: only this says the stream is storing again
      if (a.live && !a.stopping) this.say(a, 'sending', null);
      else this.o.notify(this.status());
      return true;
    }
    if (result.status === 'refused' && result.http_status === undefined) {
      if (/bearer has expired/.test(result.reason)) {
        // Refused here before sending, not by the service: the job keeps its state; the authority is renewed.
        if (!wasInDoubt) job.status = 'not_sent';
        this.save();
        await this.reconnect(a, 'its authority expired');
        return false;
      }
      if (wasInDoubt) {
        // It cannot be sent again as recorded (an original changed or went missing on this device): it stays not
        // known, and is set aside (said once) so later lines still go.
        job.stuck = true;
        (job.later ??= []).push(result.reason);
      } else {
        Object.assign(job, { status: 'refused', reason: result.reason }); // this job cannot be sent; later lines still can
      }
      this.save();
      this.o.notify(this.status());
      return !wasInDoubt;
    }
    if (result.status === 'refused') {
      if (wasInDoubt) {
        // An earlier send may have arrived: the refusal does not make the outcome known.
        (job.later ??= []).push(`${result.http_status ?? ''} ${result.error ?? result.reason}`.trim());
      } else {
        Object.assign(job, { status: 'refused', ...(result.http_status ? { http_status: result.http_status } : {}), ...(result.error ? { error: result.error } : {}), reason: result.reason });
      }
      this.save();
      // Said before the state is read (another wait): the send is no longer out, and it was refused.
      if (a.live && !a.stopping && !this.fault) this.say(a, 'stalled', 'the service refused the last send; its state is being read');
      else this.o.notify(this.status());
      await this.refusedBy(a, result);
      return !wasInDoubt;
    }
    // unknown or cancelled: in doubt if any send may have arrived; otherwise not sent.
    const inDoubt = 'in_doubt' in result ? result.in_doubt : undefined;
    if (inDoubt || wasInDoubt) Object.assign(job, { status: 'unknown', in_doubt: inDoubt ?? job.in_doubt });
    else job.status = 'not_sent';
    if (result.status === 'unknown' && result.error === 'dependency_missing') job.reason = result.reason;
    this.save();
    // Live, but this send's storage is not confirmed (it may have arrived): it stays "not confirmed" until a send is
    // answered (the same record(s) are tried again).
    a.unanswered = true;
    if (a.live && !a.stopping && !this.fault) this.say(a, 'stalled', 'storage of the last send is not confirmed (no answer, or the service said to send it again later); the same record(s) are tried again');
    else this.o.notify(this.status());
    return false;
  }
  /**
   * A refusal by the service: its 403 is the service taking this capture's authority away (withdrawn, revoked, the
   * source's permission lost), and ends the local capture too; a state read back as stopped or withdrawn likewise.
   * 401 renews the authority. Anything else stops sending; the capture goes on on this device.
   */
  private async refusedBy(a: Active, result: Extract<UploadResult, { status: 'refused' }>): Promise<void> {
    const state = a.authority ? await this.readState(a.authority, a.rec!) : null;
    if (state && state !== 'absent') {
      a.rec!.state = state;
      this.save();
      if (state.state !== 'live') return this.serviceEnded(a, state);
    }
    if (result.http_status === 403) return this.authorityLost(a, `the service refused this capture's authority (403 ${result.error ?? 'forbidden'})`);
    if (result.http_status === 401) return this.reconnect(a, 'its authority was not accepted');
    a.live = false;
    this.note(a.rec, `sending stopped: ${result.reason}`);
    this.say(a, 'not connected', `sending stopped: ${result.error ?? result.reason}`);
  }
  /** The service stopped or withdrew the stream: nothing more is sent, and the local capture is ended too. */
  private serviceEnded(a: Active, state: StreamState): void {
    a.live = false;
    const rec = a.rec!;
    rec.state = state;
    rec.final = state.state === 'withdrawn' ? 'withdrawn' : 'stopped';
    this.note(rec, `the service ${state.state === 'withdrawn' ? 'withdrew' : 'stopped'} the stream (revision ${state.revision})`);
    this.say(a, 'ended by the service', `the stream was ${state.state} by the service`);
    this.o.endCapture(a.capture_session, `the capture storage service ${state.state === 'withdrawn' ? 'withdrew' : 'stopped'} this capture`);
  }
  /** The service refused this capture's authority: nothing more is sent, and the local capture is ended too. */
  private authorityLost(a: Active, why: string): void {
    a.live = false;
    this.note(a.rec, why);
    this.say(a, 'ended by the service', why);
    this.o.endCapture(a.capture_session, `the capture storage service refused this capture's authority`);
  }
  private hostLost(a: Active, host: Host): void {
    if (this.active !== a || a.host !== host || a.stopping || !a.live) return;
    void this.reconnect(a, 'the host ended').catch(() => this.failed(a));
  }
  /** While the Start is live: the host again, without consent; it continues only if the stream is still live. */
  private async reconnect(a: Active, why: string): Promise<void> {
    a.live = false;
    if (a.reconnects >= 2 || a.stopping) {
      this.note(a.rec, `offline: ${why}`);
      return this.say(a, 'offline', why);
    }
    a.reconnects += 1;
    this.say(a, 'offline', `${why}; connecting again`);
    const old = a.host;
    a.host = null;
    a.connecting = (async () => {
      if (old) await old.end();
      if (!a.stopping) await this.connect(a, false);
    })();
    await a.connecting;
  }

  // ---- Stop ----------------------------------------------------------------------------------------------------
  /** The capture session is ending (any way): latched at once, then stopped in order. Never throws. */
  stopSending(captureSession: string): void {
    const a = this.active;
    if (!a || a.capture_session !== captureSession || a.stopping) return;
    a.stopping = true; // nothing new is planned from here
    this.say(a, 'stopping', null);
    void this.stopFlow(a);
  }
  private stopFlow(a: Active): Promise<void> {
    a.stopped ??= (async () => {
      try {
        if (a.connecting) await a.connecting.catch(() => undefined); // a connection being made finishes (it registers nothing new after the latch)
        // The job in flight may finish for a bounded time; then it is cancelled and stays in doubt.
        if (a.runner) {
          const late = await Promise.race([a.runner.then(() => false), sleep(this.o.stop_wait_ms ?? 5_000).then(() => true)]);
          if (late) {
            a.controller.abort();
            await a.runner.catch(() => undefined);
          }
        }
        a.live = false;
        if (a.rec) await this.endStream(a, a.rec);
      } catch {
        this.note(a.rec, 'an unexpected local error interrupted the Stop');
      } finally {
        if (a.host) {
          const end = await a.host.end().catch(() => ({ note: 'the host could not be ended' }));
          this.note(a.rec, end.note);
        }
        const rec = a.rec;
        this.say(a, 'stopped', !rec ? 'no stream was made' : rec.final ? `stream ${rec.final}` : rec.registered ? 'the Stop is not confirmed' : 'the stream was never confirmed registered; whether it or a grant exists is not known');
        if (this.active === a) {
          this.last = { state: a.state, detail: a.detail };
          this.active = null;
          this.o.notify(this.status());
        }
      }
    })();
    return a.stopped;
  }
  /**
   * What the stream needs to end: a registration without an answer is first read back (the stream's state, or its
   * absence); a registered stream gets its Stop; one never registered is abandoned (a grant is not used after a Stop).
   */
  private async endStream(a: Active, rec: StreamRecord): Promise<void> {
    if (rec.final !== null) return;
    if (!a.asked) {
      rec.grant = 'abandoned';
      rec.final = 'abandoned';
      this.save();
      return;
    }
    if (!rec.registered && !rec.registration_sent) {
      if (rec.grant === 'pending') {
        rec.grant = 'abandoned'; // READY said pending, and it is never registered now
        rec.final = 'abandoned';
        this.save();
      }
      return; // requested_unknown: whether a grant exists is not known (reconciled at the next start)
    }
    const authority = await this.usable(a, rec);
    if (!authority) return;
    if (!rec.registered) {
      const read = await this.readState(authority, rec);
      if (read === 'absent') {
        rec.grant = 'abandoned';
        rec.final = 'abandoned';
        this.save();
        return;
      }
      if (!read) return this.note(rec, 'whether the registration committed is not known');
      this.registeredAs(rec, read);
      this.save();
    }
    await this.sendStop(authority, rec, () => this.renew(a, rec));
  }
  /** This stream's authority if its host is up and its bearer not about to expire; else a host without consent. */
  private async usable(a: Active, rec: StreamRecord): Promise<UploadAuthority | null> {
    if (a.host && !a.hostEnded && a.authority && Date.parse(a.authority.expires_at) - Date.now() > RENEW_BEFORE_MS) return a.authority;
    return this.renew(a, rec);
  }
  /** A new host for this stream, without consent (its old one ended first). */
  private async renew(a: Active, rec: StreamRecord): Promise<UploadAuthority | null> {
    if (a.host) {
      const end = await a.host.end();
      this.note(rec, end.note);
      a.host = null;
    }
    const got = await this.launch(rec, false);
    if ('failed' in got) {
      this.note(rec, `the Stop could not be delivered: ${got.failed}`);
      return null;
    }
    this.adopt(a, got);
    return a.authority;
  }
  /**
   * One Stop, written before it is sent; the same key and body again while its outcome is unknown or its authority
   * was not accepted (renewed); a stale revision is read back and a new Stop written under its own key.
   */
  private async sendStop(authority: UploadAuthority, rec: StreamRecord, renew: () => Promise<UploadAuthority | null>): Promise<void> {
    let revision = rec.state?.revision ?? 1;
    let auth: UploadAuthority | null = authority;
    for (let round = 1; round <= 3 && rec.final === null && auth; round++) {
      // One Stop per revision: one already written for it (sent or not, answered or not) is sent again as it is.
      const last = rec.stops.at(-1);
      const same = last && last.outcome !== 'stopped' && (last.body as { expected_revision?: number }).expected_revision === revision ? last : null;
      const stop: StopRecord = same ?? { key: `${rec.stream_id}.stop.${rec.stops.length + 1}`, body: { ...CONTROL, device_id: rec.registration.device_id, session_id: rec.registration.session_id, stream_id: rec.stream_id, expected_revision: revision, action: { kind: 'stop', pre_stop_sequence: null } }, outcome: 'written' };
      if (!same) {
        rec.stops.push(stop);
        if (!this.save()) {
          rec.stops.pop();
          return this.note(rec, 'the Stop was not sent: the record could not be written');
        }
      }
      let answer = await this.call(auth, 'POST', `/v2/process/streams/${rec.stream_id}:control`, stop.body, stop.key);
      for (let n = 1; n < 4 && !answer.ok; n++) {
        if ('unknown' in answer) await sleep(this.o.retry_ms ?? 1000);
        else if (answer.status === 401) auth = await renew();
        else break;
        if (!auth) break;
        answer = await this.call(auth, 'POST', `/v2/process/streams/${rec.stream_id}:control`, stop.body, stop.key); // the same key and body
      }
      if (answer.ok) {
        const state = this.stateOf(answer.value, rec);
        stop.outcome = state && state.state !== 'live' ? 'stopped' : 'unknown';
        if (state) rec.state = state;
      } else if ('unknown' in answer) {
        stop.outcome = 'unknown';
      } else {
        Object.assign(stop, { outcome: 'refused', http_status: answer.status, error: answer.error });
      }
      this.save();
      const read = auth ? await this.readState(auth, rec) : null;
      if (read && read !== 'absent') rec.state = read;
      if (rec.state && rec.state.state !== 'live') rec.final = rec.state.state === 'withdrawn' ? 'withdrawn' : 'stopped';
      else if (stop.outcome === 'refused' && stop.error === 'stale_revision' && read && read !== 'absent') revision = read.revision; // a new Stop for the current revision
      else break;
      this.save();
    }
  }

  // ---- after a restart -----------------------------------------------------------------------------------------
  /** At app start: every stream not known to be ended is reconciled (reads and control only; nothing is resent). */
  reconcile(): Promise<void> {
    if (this.broken || !this.record) {
      this.o.notify(this.status());
      return Promise.resolve();
    }
    this.reconciling = (async () => {
      for (const rec of this.record!.streams.filter((s) => s.final === null)) await this.reconcileOne(rec);
      this.o.notify(this.status());
    })().catch(() => undefined);
    return this.reconciling;
  }
  /** One stream: a host without consent; reads, and a Stop if it is live; never a resend. Its host is always ended. */
  private async reconcileOne(rec: StreamRecord): Promise<void> {
    const got = await this.launch(rec, false);
    if ('failed' in got) return this.note(rec, `not reconciled: ${got.failed}`);
    try {
      if (got.host.start_status === 'pending') {
        rec.grant = 'abandoned'; // never registered without the user's Start
        rec.final = 'abandoned';
      } else {
        const state = await this.readState(got.authority, rec);
        if (state && state !== 'absent') {
          this.registeredAs(rec, state);
          if (state.state === 'live') await this.sendStop(got.authority, rec, async () => null);
          else rec.final = state.state === 'withdrawn' ? 'withdrawn' : 'stopped';
        } else {
          rec.notes.push(`not reconciled: the stream's state could not be read`);
        }
        // Jobs in doubt stay unknown: nothing is sent again after a restart.
        for (const j of rec.jobs) if (j.status === 'sending') j.status = 'unknown';
      }
    } catch {
      rec.notes.push('not reconciled: an unexpected local error');
    } finally {
      const end = await got.host.end().catch(() => ({ note: 'the host could not be ended' }));
      rec.notes.push(`reconciled: ${end.note}`);
      this.save();
    }
  }

  /** At quit: the active stream is stopped (bounded); resolves when done or at the bound. */
  async quit(boundMs = 20_000): Promise<void> {
    const a = this.active;
    if (!a) return;
    if (!a.stopping) this.stopSending(a.capture_session);
    let bound: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.stopFlow(a), new Promise<void>((r) => (bound = setTimeout(r, boundMs)))]);
    clearTimeout(bound);
  }
}
