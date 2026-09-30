// A capture folder growing line by line as the app's does (from the harness-ink fixture), a capture link on it with
// every request it makes recorded (and, where asked, faults injected), for the link's tests and the owned run.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CaptureLink, type LinkConfig, type LinkStatus } from '../src/main/capture-link.ts';
import { loopbackTransport, type Transport } from '../src/main/loopback-http.ts';
import type { HostLaunch } from '../src/main/capture-host.ts';
import { EVIDENCE } from '../scripts/ingress-fixtures.ts';

const temps: string[] = [];
export const removeTemps = (): void => temps.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
export const temp = (prefix: string): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
};
export type WorldOptions = {
  fault?: (r: { method: string; path: string; n: number }) => 'drop-answer' | 'refuse' | null;
  /** The host to launch (a memory-store wrapper, or the released module). */
  launch: HostLaunch;
  /** The DSN file (default: a private folder named as the host, for the kept in-memory store). */
  dsnFile?: string;
  /** A given actor (the owned run's pristine one), written into the record before the link first reads it. */
  actor?: string;
};

export const INK = path.join(EVIDENCE, 'windows-frame-ingress', 'harness-ink-capture');
export const MANIFEST = fs.readFileSync(path.join(INK, 'manifest.jsonl'), 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean);
export const SESSION = JSON.parse(MANIFEST[0]!).capture_session as string;

/** A capture folder growing line by line like the app's, a link on it, and every request it makes. */
export function world(o: WorldOptions) {
  const userData = temp('lc-link-');
  const storeDir = temp('lc-store-');
  let dsnFile = o.dsnFile;
  if (!dsnFile) {
    dsnFile = path.join(temp('lc-dsn-'), 'test-database.dsn');
    fs.writeFileSync(dsnFile, `host=${storeDir} port=5432 dbname=lc_p0_test user=test-marker-user connect_timeout=5`);
  }
  const config: LinkConfig = { launch: o.launch, dsn_file: dsnFile };
  if (o.actor) {
    fs.mkdirSync(path.join(userData, 'capture-host'), { recursive: true });
    const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    fs.writeFileSync(path.join(userData, 'capture-host', 'coordination.json'), JSON.stringify({ format: 'lc-windows-capture-link/v1', actor: { user_id: o.actor, device_id: `windows-${hex(16)}`, session_id: `learning-${hex(16)}`, producer_id: `windows-app-${hex(16)}` }, last_registered_stream: null, streams: [] }));
  }
  const capture = path.join(userData, 'captures', SESSION);
  fs.mkdirSync(capture, { recursive: true });
  for (const d of ['frames', 'ink']) fs.cpSync(path.join(INK, d), path.join(capture, d), { recursive: true });
  const requests: Array<{ method: string; path: string; key: string | undefined; auth: string | undefined; origin: string }> = [];
  let n = 0;
  const transport: Transport = async (r) => {
    const u = new URL(r.url);
    const entry = { method: r.method, path: u.pathname, key: r.headers['Idempotency-Key'], auth: r.headers['Authorization'], origin: u.origin };
    if (u.pathname !== '/openapi.json') requests.push(entry);
    const fate = o.fault?.({ method: r.method, path: u.pathname, n: ++n }) ?? null;
    if (fate === 'refuse') throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    const answer = await loopbackTransport(r);
    if (fate === 'drop-answer') throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    return answer;
  };
  const statuses: LinkStatus[] = [];
  const ended: string[] = [];
  const make = (t: Transport = transport) => new CaptureLink({ userData, config, notify: (s) => statuses.push(s), endCapture: (session, reason) => ended.push(`${session}: ${reason}`), transport: t, retry_ms: 50, stop_wait_ms: 2000 });
  let written = 0;
  const append = (link: CaptureLink, count: number): void => {
    const lines = MANIFEST.slice(written, written + count);
    written += lines.length;
    fs.appendFileSync(path.join(capture, 'manifest.jsonl'), lines.map((l) => `${l}\n`).join(''));
    link.appended(SESSION, fs.statSync(path.join(capture, 'manifest.jsonl')).size);
  };
  const record = () => JSON.parse(fs.readFileSync(path.join(userData, 'capture-host', 'coordination.json'), 'utf8'));
  return { userData, storeDir, dsnFile, capture, requests, statuses, ended, make, append, record, transport };
}
export const until = async (what: string, ok: () => boolean, ms = 30_000): Promise<void> => {
  const by = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > by) assert.fail(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
};
export const state = (s: LinkStatus) => (s.mode === 'development' ? s.state : s.mode);

/** The pid of the host process listening on `origin`'s port (Linux only), for the crash case. */
export async function ownHostPid(origin: string): Promise<number | null> {
  if (process.platform !== 'linux') return null;
  const port = Number(new URL(origin).port);
  const inode = fs.readFileSync('/proc/net/tcp', 'utf8').split('\n').slice(1).map((l) => l.trim().split(/\s+/)).find((f) => f[1]?.endsWith(`:${port.toString(16).toUpperCase().padStart(4, '0')}`) && f[3] === '0A')?.[9];
  if (!inode) return null;
  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try {
      if (fs.readdirSync(`/proc/${pid}/fd`).some((fd) => fs.readlinkSync(`/proc/${pid}/fd/${fd}`) === `socket:[${inode}]`)) return Number(pid);
    } catch {
      // not ours to read
    }
  }
  return null;
}
