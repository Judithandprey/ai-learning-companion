// Fakes for the capture link's tests without the Backend: a stand-in for the host's child process (no process, no
// port) that takes its startup line, then says `ready` (or nothing), and exits at the end of its input, or only when
// told (`hold`); a stand-in for the service's answers; and a coordination record as this app writes it.
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import * as fs from 'node:fs';
import type { spawn } from 'node:child_process';
import type { Transport } from '../src/main/loopback-http.ts';

export class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid = 4_000_000 + Math.floor(Math.random() * 1000);
  input = '';
  exited = false;
  /** `ready`: its READY, or one from its startup record (parsed), or none. */
  constructor(o: { ready: object | ((startup: { fresh_consent: boolean }) => object) | null; hold?: boolean }) {
    super();
    this.stdin.on('data', (c: Buffer) => {
      this.input += c.toString('utf8');
      if (!o.ready || !this.input.endsWith('\n')) return;
      const ready = typeof o.ready === 'function' ? o.ready(JSON.parse(this.input)) : o.ready;
      this.stdout.write(`${JSON.stringify(ready)}\n`);
    });
    this.stdin.on('end', () => void (o.hold ? undefined : this.exit(0)));
    process.nextTick(() => this.emit('spawn'));
  }
  exit(code: number | null): void {
    if (this.exited) return;
    this.exited = true;
    this.emit('exit', code, code === null ? 'SIGTERM' : null);
  }
  kill(): boolean {
    this.exit(null);
    return true;
  }
}
export const READY_CONSUMED = { format: 'lc-desktop-capture-host-ready-v1', status: 'ready', origin: 'http://127.0.0.1:9', start_status: 'consumed' };
/** READY as the released host says it: pending for a fresh-consent Start, consumed otherwise. */
export const readyFor = (startup: { fresh_consent: boolean }): object => ({ ...READY_CONSUMED, start_status: startup.fresh_consent ? 'pending' : 'consumed' });
/** A spawn that makes fake children (each one kept in `children`). */
export function fakeSpawn(make: () => FakeChild, children: FakeChild[] = []): { spawn: typeof spawn; children: FakeChild[] } {
  return { spawn: (() => {
    const c = make();
    children.push(c);
    return c;
  }) as unknown as typeof spawn, children };
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
export const ACTOR = { user_id: `lc-windows-http-${'a'.repeat(32)}`, device_id: 'windows-0123456789abcdef', session_id: 'learning-0123456789abcdef', producer_id: 'windows-app-0123456789abcdef' };
export const STREAM = 'stream-0123456789abcdef01234567';
export const SOURCE = 'src-0123456789abcdef01234567';
/** A record as this app writes it: one live registered stream with two stored records and one whose outcome is unknown. */
export function seedRecord() {
  const source = { user_id: ACTOR.user_id, source_id: SOURCE, source_version: 1 };
  const key = `${SOURCE}.b4-4`;
  const body = JSON.stringify({ batch: 'exact bytes of the unknown job' });
  return {
    format: 'lc-windows-capture-link/v1',
    actor: { ...ACTOR },
    last_registered_stream: STREAM,
    streams: [{
      capture_session: 'capture-20260930-0001',
      capture_dir: path.join(os.tmpdir(), 'lc-no-such-capture'),
      stream_id: STREAM,
      source_id: SOURCE,
      registration: { contract_version: '0.2.1', device_id: ACTOR.device_id, session_id: ACTOR.session_id, stream_id: STREAM, authorization_generation: 1, membership_revision: 1, continuity: { kind: 'initial' } },
      registration_key: `${STREAM}.register`,
      grant: 'consumed',
      registered: true,
      registration_sent: true,
      state: { revision: 1, state: 'live', pre_stop_sequence: null, read_at: '2026-09-30T00:00:00.000Z' } as { revision: number; state: string; pre_stop_sequence: null; read_at: string },
      source,
      planned_through: 4,
      jobs: [
        { key: `${SOURCE}.b2-3`, from: 2, through: 3, records: 2, status: 'committed', body_sha256: sha('committed'), originals: [`${SOURCE}.png.${'1'.repeat(64)}`], ack_sha256: sha('ack') },
        { key, from: 4, through: 4, records: 1, status: 'unknown', plan: { batch_id: key, idempotency_key: key, delivery_mode: 'live', device_id: ACTOR.device_id, session_id: ACTOR.session_id, stream_id: STREAM, source, capture_session: 'capture-20260930-0001', entries: [{ sequence: 4 }] }, body, body_sha256: sha(body), originals: [], in_doubt: 'the answer was lost' },
      ] as Array<Record<string, unknown>>,
      stops: [] as unknown[],
      final: null as string | null,
      notes: ['sending'],
    }],
  };
}
export type SeedRecord = ReturnType<typeof seedRecord>;

/**
 * The service's answers without a service (no socket): a registration (live), the display source, the state, a Stop,
 * read from the coordination record `file` as the app wrote it; `own` answers first where it returns one. Uploads
 * (originals, batches) are answered 503 unless `own` answers them. Every request but the port probe is in `requests`.
 * `hold`: a request it returns a promise for is not answered until that settles (a service that holds its connection
 * and says nothing); a cancelled request still ends at once, as the real transport's does.
 */
export function fakeService(file: string, own?: (method: string, path: string, body: string | null) => { status: number; text: string } | null, hold?: (method: string, path: string) => Promise<void> | null) {
  const requests: string[] = [];
  let stopped = false;
  const transport: Transport = async (r) => {
    const p = new URL(r.url).pathname;
    if (p === '/openapi.json') return { status: 404, text: '{}' };
    requests.push(`${r.method} ${p}`);
    const held = hold?.(r.method, p);
    if (held) {
      await Promise.race([held, new Promise<never>((_ok, fail) => r.signal?.addEventListener('abort', () => fail(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }))]);
    }
    const record = JSON.parse(fs.readFileSync(file, 'utf8')) as { actor: { user_id: string }; streams: Array<{ stream_id: string }> };
    const state = (revision: number, s: string) => ({ status: 200, text: JSON.stringify({ contract_version: '0.2.1', stream_id: record.streams.at(-1)!.stream_id, revision, state: s, pre_stop_sequence: null }) });
    const mine = own?.(r.method, p, r.body);
    if (mine) return mine;
    if (r.method === 'POST' && p === '/v2/process/streams') return state(1, 'live');
    if (r.method === 'PUT' && p.startsWith('/v2/process/display-sources/')) return { status: 200, text: JSON.stringify({ contract_version: '0.2.4', source_id: p.split('/').at(-1), user_id: record.actor.user_id, source_version: 1 }) };
    if (r.method === 'GET' && p.startsWith('/v2/process/streams/')) return stopped ? state(2, 'stopped') : state(1, 'live');
    if (p.endsWith(':control')) return ((stopped = true), state(2, 'stopped'));
    return { status: 503, text: JSON.stringify({ contract_version: '0.2.4', error: 'unavailable', retryable: true }) };
  };
  return { transport, requests };
}
