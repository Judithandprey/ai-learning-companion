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
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { join } from 'node:path';
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
const hex = (n: number): string => randomBytes(n).toString('hex');
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

// ---- status -------------------------------------------------------------------------------------------------
export type LinkStatus =
  | { readonly mode: 'off' }
  | { readonly mode: 'unavailable'; readonly reason: string }
  | {
      readonly mode: 'development';
      /** What this app's capture link is doing now. */
      readonly state: 'idle' | 'connecting' | 'sending' | 'offline' | 'stopping' | 'stopped' | 'not connected' | 'ended by the service' | 'reconciling';
      readonly stored: number;
      readonly unknown: number;
      readonly refused: number;
      readonly not_sent: number;
      readonly detail: string | null;
      /** Earlier streams whose end is not known. */
      readonly earlier_unknown: number;
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
};

type Active = {
  rec: StreamRecord;
  host: Host | null;
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
  /** Whether a host was ever asked to start for this stream (a grant may exist from then on). */
  asked: boolean;
};

const CONTROL = { contract_version: '0.2.1' } as const;
const SCOPES = ['process:capture', 'process:control', 'sources:read', 'sources:write'];
const CAPABILITIES = ['process.capture.v0.2', 'process.control.v0.2.1', 'process.ingress.v0.2.4', 'process.windows-ingress.v0.2.10'];
const TOKEN_LIFE_MS = 12 * 60 * 60 * 1000;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class CaptureLink {
  private record: CoordinationRecord | null = null;
  private broken: string | null = null;
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
    if (!existsSync(this.file)) return;
    try {
      const v = JSON.parse(readFileSync(this.file, 'utf8')) as CoordinationRecord;
      if (v?.format !== RECORD_FORMAT || !Array.isArray(v.streams) || typeof v.actor?.user_id !== 'string') throw new Error('format');
      this.record = v;
    } catch {
      // Left untouched: nothing is written over it, and no grant is asked for without it.
      this.broken = 'the capture link record could not be read; it is left as it is, and development capture storage is off';
    }
  }
  /** Written whole to a temporary file, flushed, then renamed over the record. */
  private save(): void {
    if (!this.record || this.broken) return;
    const dir = join(this.o.userData, 'capture-host');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    const fd = openSync(tmp, 'w', 0o600);
    try {
      writeSync(fd, `${JSON.stringify(this.record)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.file);
  }
  /** The record, created with a new actor on the first Start (never while an unreadable one exists). */
  private ensureRecord(): CoordinationRecord | null {
    if (this.broken) return null;
    this.record ??= { format: RECORD_FORMAT, actor: { user_id: `lc-windows-http-${hex(16)}`, device_id: `windows-${hex(8)}`, session_id: `learning-${hex(8)}`, producer_id: `windows-app-${hex(8)}` }, last_registered_stream: null, streams: [] };
    return this.record;
  }
  /** A copy of the record as written (for checks and evidence; it holds no token or DSN). */
  snapshot(): CoordinationRecord | null {
    return this.record ? (JSON.parse(JSON.stringify(this.record)) as CoordinationRecord) : null;
  }

  // ---- status --------------------------------------------------------------------------------------------------
  status(): LinkStatus {
    if (this.broken) return { mode: 'unavailable', reason: this.broken };
    const a = this.active;
    const rec = a?.rec ?? this.record?.streams.at(-1) ?? null;
    const count = (s: JobRecord['status'][]): number => (rec?.jobs ?? []).filter((j) => s.includes(j.status)).reduce((n, j) => n + j.records, 0);
    const earlier = (this.record?.streams ?? []).filter((s) => s.final === null && s !== a?.rec).length;
    return {
      mode: 'development',
      state: a ? a.state : this.last ? this.last.state : rec ? (rec.final ? 'stopped' : 'not connected') : 'idle',
      stored: count(['committed']),
      unknown: count(['unknown', 'sending']),
      refused: count(['refused']),
      not_sent: count(['not_sent', 'unsendable']),
      detail: a ? a.detail : this.last ? this.last.detail : rec ? rec.notes.at(-1) ?? null : null,
      earlier_unknown: earlier,
    };
  }
  private say(a: Active, state: Active['state'], detail: string | null = a.detail): void {
    a.state = state;
    a.detail = detail;
    this.o.notify(this.status());
  }

  // ---- host and requests ---------------------------------------------------------------------------------------
  private async launch(rec: StreamRecord, fresh: boolean): Promise<{ host: Host; authority: UploadAuthority } | string> {
    let dsn: string | null;
    try {
      dsn = testDatabaseDsn((this.o.readDsn ?? ((p: string) => readFileSync(p, 'utf8')))(this.o.config.dsn_file));
    } catch {
      return 'the test database DSN file could not be read';
    }
    if (!dsn) return 'the DSN file does not name the dedicated local test database (lc_p0_test)';
    const actor = this.record!.actor;
    const token = hex(32);
    const expires_at = new Date(Date.now() + TOKEN_LIFE_MS).toISOString();
    const startup: StartupRecord = {
      format: STARTUP_FORMAT, port: 0, database_dsn: dsn, ...actor, registration: rec.registration, token, expires_at,
      scopes: SCOPES, capabilities: CAPABILITIES, fresh_consent: fresh, producer_profile: 'desktop_pixels',
      enable_raw_ingress: false, enable_desktop_ingress: false, enable_windows_ingress: true, enable_macos_ingress: false,
    };
    const started = await startHost(this.o.config.launch, startup, { transport: this.transport, ...this.o.host });
    if (!started.ok) return started.reason;
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
  private stateOf(v: Record<string, unknown>, rec: StreamRecord): StreamState | null {
    if (v['stream_id'] !== rec.stream_id || typeof v['revision'] !== 'number' || !['live', 'stopped', 'withdrawn'].includes(v['state'] as string)) return null;
    return { revision: v['revision'], state: v['state'] as StreamState['state'], pre_stop_sequence: (v['pre_stop_sequence'] as number | null) ?? null, read_at: new Date().toISOString() };
  }
  /** The registration, under its own key (a replay answers the stream's current state); bounded while unknown. */
  private async register(authority: UploadAuthority, rec: StreamRecord): Promise<StreamState | string> {
    for (let n = 0; n < 3; n++) {
      const r = await this.call(authority, 'POST', '/v2/process/streams', rec.registration, rec.registration_key);
      if (r.ok) return this.stateOf(r.value, rec) ?? 'the registration answer is not this stream\'s state';
      if (!('unknown' in r)) return `the registration was refused (${r.status} ${r.error})`;
      await sleep(this.o.retry_ms ?? 1000);
    }
    return 'the registration was sent without an answer';
  }
  private async readState(authority: UploadAuthority, rec: StreamRecord): Promise<StreamState | null> {
    const r = await this.call(authority, 'GET', `/v2/process/streams/${rec.stream_id}`, null);
    return r.ok ? this.stateOf(r.value, rec) : null;
  }

  // ---- Start ---------------------------------------------------------------------------------------------------
  /** At an explicit user Start of capture session `captureSession` (retained under `captureDir`). */
  begin(captureSession: string, captureDir: string): void {
    const record = this.ensureRecord();
    const before = this.active;
    if (!record || (before && !before.stopping)) return void this.o.notify(this.status());
    const stream_id = `stream-${hex(12)}`;
    const previous = record.last_registered_stream;
    const rec: StreamRecord = {
      capture_session: captureSession,
      capture_dir: captureDir,
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
    this.save(); // before the host is asked for anything
    const a: Active = { rec, host: null, authority: null, live: false, stopping: false, validBytes: 0, runner: null, again: false, controller: new AbortController(), reconnects: 0, state: 'connecting', detail: null, connecting: null, stopped: null, asked: false };
    this.active = a;
    this.last = null;
    this.o.notify(this.status());
    a.connecting = (async () => {
      await this.reconciling; // an earlier stream is stopped first, if it can be
      if (before?.stopped) await before.stopped;
      if (!a.stopping) await this.connect(a, true);
    })();
  }
  /** Starts the host (fresh consent only at the Start), registers, creates the source; then sending may run. */
  private async connect(a: Active, fresh: boolean): Promise<void> {
    const rec = a.rec;
    this.say(a, 'connecting', null);
    a.asked = true;
    const got = await this.launch(rec, fresh);
    if (typeof got === 'string') {
      rec.notes.push(`not connected: ${got}`);
      this.save();
      return this.say(a, 'not connected', got);
    }
    a.host = got.host;
    a.authority = got.authority;
    if (got.host.start_status === 'pending') {
      if (!fresh || a.stopping) {
        // Never registered after a Stop or without the user's Start.
        rec.grant = 'pending';
        this.save();
        return;
      }
      rec.grant = 'pending';
      this.save();
    }
    const state = await this.register(got.authority, rec);
    if (typeof state === 'string') {
      rec.notes.push(state);
      this.save();
      return this.say(a, 'not connected', state);
    }
    rec.grant = 'consumed';
    rec.registered = true;
    rec.state = state;
    this.record!.last_registered_stream = rec.stream_id;
    this.save();
    if (state.state !== 'live') return this.serviceEnded(a, state);
    if (a.stopping) return; // the Stop follows; nothing is created or sent after it
    if (!rec.source) {
      const r = await this.call(got.authority, 'PUT', `/v2/process/display-sources/${rec.source_id}`, { contract_version: '0.2.4', source_id: rec.source_id, stream_id: rec.stream_id, project_id: null, source_timezone: 'UTC' });
      if (!r.ok || r.value['source_id'] !== rec.source_id || typeof r.value['user_id'] !== 'string' || r.value['source_version'] !== 1) {
        const why = r.ok ? 'the display source answer is not this source' : 'unknown' in r ? 'the display source was sent without an answer' : `the display source was refused (${r.status} ${r.error})`;
        rec.notes.push(why);
        this.save();
        return this.say(a, 'not connected', why);
      }
      rec.source = { user_id: r.value['user_id'] as string, source_id: rec.source_id, source_version: 1 };
      this.save();
    }
    a.authority = { ...got.authority, owner: rec.source };
    if (a.stopping) return;
    a.live = true;
    this.say(a, 'sending', null);
    void got.host.exited.then(() => this.hostLost(a, got.host));
    this.kick(a);
  }

  // ---- sending -------------------------------------------------------------------------------------------------
  /** After each successful append to capture session `captureSession`'s manifest. */
  appended(captureSession: string, validBytes: number): void {
    const a = this.active;
    if (!a || a.rec.capture_session !== captureSession) return;
    a.validBytes = validBytes;
    this.kick(a);
  }
  private kick(a: Active): void {
    if (!a.live || a.stopping) return;
    if (a.runner) return void (a.again = true);
    a.runner = (async () => {
      try {
        do {
          a.again = false;
          await this.run(a);
        } while (a.again && a.live && !a.stopping);
      } finally {
        a.runner = null;
      }
    })();
  }
  private facts(rec: StreamRecord): StreamFacts {
    return { device_id: rec.registration.device_id, session_id: rec.registration.session_id, stream_id: rec.stream_id, source: rec.source!, capture_session: rec.capture_session };
  }
  /** Sends what is retained: first the oldest unsettled job (the same bytes), then the next lines, in order. */
  private async run(a: Active): Promise<void> {
    const rec = a.rec;
    while (a.live && !a.stopping) {
      const open = rec.jobs.find((j) => j.status === 'sending' || j.status === 'unknown' || j.status === 'not_sent');
      if (open) {
        const settled = await this.send(a, open);
        if (!settled) {
          if (!a.live || a.stopping) return;
          await sleep(this.o.retry_ms ?? 1000);
        }
        continue;
      }
      let text: string;
      try {
        text = readFileSync(join(rec.capture_dir, 'manifest.jsonl')).subarray(0, a.validBytes).toString('utf8');
      } catch {
        return this.say(a, 'sending', 'the retention manifest could not be read');
      }
      let planned;
      try {
        planned = planNext(text, this.facts(rec), rec.planned_through);
      } catch {
        a.live = false;
        rec.notes.push('the retention manifest is not of this stream\'s capture session; sending stopped');
        this.save();
        return this.say(a, 'not connected', 'the retention manifest is not of this stream\'s capture session');
      }
      if (planned.kind === 'none' || planned.kind === 'ended') return this.say(a, 'sending', null);
      if (planned.kind === 'unsendable') {
        rec.jobs.push({ key: `unsendable-${planned.line}`, from: planned.line, through: planned.line, records: 1, status: 'unsendable', originals: [], reason: planned.reason });
        rec.planned_through = planned.line;
        this.save();
        continue;
      }
      const job: JobRecord = { key: planned.plan.idempotency_key, from: planned.from_line, through: planned.through_line, records: planned.plan.entries.length, status: 'sending', plan: planned.plan, body: planned.prepared.body, body_sha256: sha(planned.prepared.body), originals: [] };
      rec.jobs.push(job);
      rec.planned_through = planned.through_line;
      this.save(); // before its first send
      await this.send(a, job);
    }
  }
  /** One upload of `job` (its exact plan and body). Returns whether it is settled (committed, refused). */
  private async send(a: Active, job: JobRecord): Promise<boolean> {
    const wasInDoubt = job.status === 'unknown';
    const result: UploadResult = await uploadRetained(a.authority!, { capture_dir: a.rec.capture_dir, plan: job.plan!, prepared: { idempotency_key: job.key, body: job.body!, request: JSON.parse(job.body!), unrepresented: [] } }, { signal: a.controller.signal, transport: this.transport, attempts: 3, pause_ms: 500 });
    job.originals = [...new Set([...job.originals, ...result.originals])];
    if (result.status === 'committed') {
      Object.assign(job, { status: 'committed', ack_sha256: sha(JSON.stringify(result.ack)) });
      delete job.plan;
      delete job.body;
      delete job.in_doubt;
      this.save();
      this.o.notify(this.status());
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
      // This job cannot be sent as it is (an original changed or is missing on this device); later lines still can.
      if (wasInDoubt) (job.later ??= []).push(result.reason);
      else Object.assign(job, { status: 'refused', reason: result.reason });
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
      await this.refusedBy(a, result);
      return !wasInDoubt;
    }
    // unknown or cancelled: in doubt if any send may have arrived; otherwise not sent.
    const inDoubt = 'in_doubt' in result ? result.in_doubt : undefined;
    if (inDoubt || wasInDoubt) Object.assign(job, { status: 'unknown', in_doubt: inDoubt ?? job.in_doubt });
    else job.status = 'not_sent';
    if (result.status === 'unknown' && result.error === 'dependency_missing') job.reason = result.reason;
    this.save();
    this.o.notify(this.status());
    return false;
  }
  /** A refusal: the stream's state decides. The service ended it: local capture ends too. Authority: reconnect. */
  private async refusedBy(a: Active, result: Extract<UploadResult, { status: 'refused' }>): Promise<void> {
    const state = a.authority ? await this.readState(a.authority, a.rec) : null;
    if (state) {
      a.rec.state = state;
      this.save();
      if (state.state !== 'live') return this.serviceEnded(a, state);
    }
    if (result.http_status === 401) return this.reconnect(a, 'its authority was not accepted');
    a.live = false;
    a.rec.notes.push(`sending stopped: ${result.reason}`);
    this.save();
    this.say(a, 'not connected', `sending stopped: ${result.error ?? result.reason}`);
  }
  /** The service stopped or withdrew the stream: nothing more is sent, and the local capture is ended too. */
  private serviceEnded(a: Active, state: StreamState): void {
    a.live = false;
    a.rec.state = state;
    a.rec.final = state.state === 'withdrawn' ? 'withdrawn' : 'stopped';
    a.rec.notes.push(`the service ${state.state === 'withdrawn' ? 'withdrew' : 'stopped'} the stream (revision ${state.revision})`);
    this.save();
    this.say(a, 'ended by the service', `the stream was ${state.state} by the service`);
    this.o.endCapture(a.rec.capture_session, `the capture storage service ${state.state === 'withdrawn' ? 'withdrew' : 'stopped'} this capture`);
  }
  private hostLost(a: Active, host: Host): void {
    if (this.active !== a || a.host !== host || a.stopping || !a.live) return;
    void this.reconnect(a, 'the host ended');
  }
  /** While the Start is live: the host again, without consent; it continues only if the stream is still live. */
  private async reconnect(a: Active, why: string): Promise<void> {
    a.live = false;
    if (a.reconnects >= 2 || a.stopping) {
      a.rec.notes.push(`offline: ${why}`);
      this.save();
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
  /** The capture session is ending (any way): latched at once, then stopped in order. */
  stopSending(captureSession: string): void {
    const a = this.active;
    if (!a || a.rec.capture_session !== captureSession || a.stopping) return;
    a.stopping = true; // nothing new is planned from here
    this.say(a, 'stopping', null);
    void this.stopFlow(a);
  }
  private stopFlow(a: Active): Promise<void> {
    a.stopped ??= (async () => {
      const rec = a.rec;
      if (a.connecting) await a.connecting; // a connection being made finishes (it registers nothing new after the latch)
      // The job in flight may finish for a bounded time; then it is cancelled and stays in doubt.
      if (a.runner) {
        const late = await Promise.race([a.runner.then(() => false), sleep(this.o.stop_wait_ms ?? 5_000).then(() => true)]);
        if (late) {
          a.controller.abort();
          await a.runner;
        }
      }
      a.live = false;
      if (a.authority && rec.registered && rec.final === null) await this.sendStop(a.authority, rec);
      else if (!rec.registered && (rec.grant === 'pending' || !a.asked)) {
        // Never registered, and never will be: a pending grant is not used after the Stop (no host asked: none).
        rec.grant = 'abandoned';
        rec.final = 'abandoned';
      }
      if (a.host) {
        const end = await a.host.end();
        rec.notes.push(end.note);
      }
      this.save();
      this.say(a, 'stopped', rec.final ? `stream ${rec.final}` : rec.registered ? 'the Stop is not confirmed' : 'the stream was never registered; whether a grant exists is not known');
      if (this.active === a) {
        this.last = { state: a.state, detail: a.detail };
        this.active = null;
      }
    })();
    return a.stopped;
  }
  /** One Stop, written before it is sent; a stale revision is read back and a new Stop written under its own key. */
  private async sendStop(authority: UploadAuthority, rec: StreamRecord): Promise<void> {
    let revision = rec.state?.revision ?? 1;
    for (let round = 1; round <= 3 && rec.final === null; round++) {
      const stop: StopRecord = { key: `${rec.stream_id}.stop.${rec.stops.length + 1}`, body: { ...CONTROL, device_id: rec.registration.device_id, session_id: rec.registration.session_id, stream_id: rec.stream_id, expected_revision: revision, action: { kind: 'stop', pre_stop_sequence: null } }, outcome: 'written' };
      rec.stops.push(stop);
      this.save(); // before its first dispatch
      let answer = await this.call(authority, 'POST', `/v2/process/streams/${rec.stream_id}:control`, stop.body, stop.key);
      for (let n = 1; n < 3 && !answer.ok && 'unknown' in answer; n++) {
        await sleep(this.o.retry_ms ?? 1000);
        answer = await this.call(authority, 'POST', `/v2/process/streams/${rec.stream_id}:control`, stop.body, stop.key); // the same key and body
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
      const read = await this.readState(authority, rec);
      if (read) rec.state = read;
      if (rec.state && rec.state.state !== 'live') rec.final = rec.state.state === 'withdrawn' ? 'withdrawn' : 'stopped';
      else if (stop.outcome === 'refused' && stop.error === 'stale_revision' && read) revision = read.revision; // a new Stop for the current revision
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
      for (const rec of this.record!.streams.filter((s) => s.final === null)) {
        const got = await this.launch(rec, false);
        if (typeof got === 'string') {
          rec.notes.push(`not reconciled: ${got}`);
          this.save();
          continue;
        }
        if (got.host.start_status === 'pending') {
          rec.grant = 'abandoned'; // never registered without the user's Start
          rec.final = 'abandoned';
        } else {
          rec.grant = 'consumed';
          const state = await this.register(got.authority, rec); // the same key: a replay answers the current state
          if (typeof state !== 'string') {
            rec.registered = true;
            rec.state = state;
            if (state.state === 'live') await this.sendStop(got.authority, rec);
            else rec.final = state.state === 'withdrawn' ? 'withdrawn' : 'stopped';
          } else {
            rec.notes.push(`not reconciled: ${state}`);
          }
          // Jobs in doubt stay unknown: nothing is sent again after a restart.
          for (const j of rec.jobs) if (j.status === 'sending') j.status = 'unknown';
        }
        const end = await got.host.end();
        rec.notes.push(`reconciled: ${end.note}`);
        this.save();
      }
      this.o.notify(this.status());
    })();
    return this.reconciling;
  }

  /** At quit: the active stream is stopped (bounded); resolves when done or at the bound. */
  async quit(boundMs = 20_000): Promise<void> {
    const a = this.active;
    if (!a) return;
    if (!a.stopping) this.stopSending(a.rec.capture_session);
    await Promise.race([this.stopFlow(a), sleep(boundMs)]);
  }
}
