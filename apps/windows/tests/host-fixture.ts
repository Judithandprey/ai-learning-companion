// A private copy of the released Backend for host checks (never the repo or the shared extract), with two test-only
// modules beside it: lc_test_memory_host (the released host's own main over an in-memory store) and
// lc_test_stubborn_host (does not end at the end of its input). Runs when LC_BACKEND_ROOT (a Backend extracted at
// the release, with services/api/desktop_local.py) and LC_PYTHON (the repo's Python with uvicorn) are set.
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { HostLaunch, StartupRecord } from '../src/main/capture-host.ts';

export const BACKEND = process.env['LC_BACKEND_ROOT'];
export const PYTHON = process.env['LC_PYTHON'];
export const hostAvailable = Boolean(BACKEND && PYTHON && fs.existsSync(path.join(BACKEND, 'services', 'api', 'desktop_local.py')));

const roots: string[] = [];
/** A private copy of the Backend with the test modules; removed by `removeCopies`. */
export function privateBackend(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-backend-'));
  for (const d of ['services', 'packages']) fs.cpSync(path.join(BACKEND!, d), path.join(root, d), { recursive: true });
  fs.copyFileSync(path.join(import.meta.dirname, 'host-memory.py'), path.join(root, 'lc_test_memory_host.py'));
  fs.copyFileSync(path.join(import.meta.dirname, 'host-stubborn.py'), path.join(root, 'lc_test_stubborn_host.py'));
  roots.push(root);
  return root;
}
export const removeCopies = (): void => roots.splice(0).forEach((r) => fs.rmSync(r, { recursive: true, force: true }));
export const memoryLaunch = (root: string, module = 'lc_test_memory_host'): HostLaunch => ({ kind: 'fifo', python: PYTHON!, cwd: root, module });

export const newToken = (): string => crypto.randomBytes(32).toString('hex');
export const ACTOR = { user_id: `lc-windows-http-${'0'.repeat(32)}`, device_id: 'dev-windows-test', session_id: 'sess-windows-test', producer_id: 'windows-app-test' };
export function registration(stream_id: string, continuity: unknown = { kind: 'initial' }) {
  return { contract_version: '0.2.1', device_id: ACTOR.device_id, session_id: ACTOR.session_id, stream_id, authorization_generation: 1, membership_revision: 1, continuity };
}
export function record(o: { fresh: boolean; token: string; stream_id: string; dsn?: string; expires_in_ms?: number }): StartupRecord {
  return {
    format: 'lc-desktop-capture-host-v1',
    port: 0,
    database_dsn: o.dsn ?? 'host=/nonexistent dbname=lc_p0_test user=memory',
    ...ACTOR,
    registration: registration(o.stream_id),
    token: o.token,
    expires_at: new Date(Date.now() + (o.expires_in_ms ?? 3_600_000)).toISOString(),
    scopes: ['process:capture', 'process:control', 'sources:read', 'sources:write'],
    capabilities: ['process.capture.v0.2', 'process.control.v0.2.1', 'process.ingress.v0.2.4', 'process.windows-ingress.v0.2.10'],
    fresh_consent: o.fresh,
    producer_profile: 'desktop_pixels',
    enable_raw_ingress: false,
    enable_desktop_ingress: false,
    enable_windows_ingress: true,
    enable_macos_ingress: false,
  };
}
