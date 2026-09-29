// Check-harness helper: runs the backend's local document preview API
// (`python -m services.api.preview_local`, document-preview.0.1.0) in the foreground
// of a browser check, from an exported copy of the released backend commit, on the
// dedicated local PostgreSQL test database. Test use only; nothing here is part of
// the preview page or its launcher.
//
// The DSN is read from the local test-database handoff file and passed only in the
// API process environment. Tokens are random per start. Neither is logged: every
// logged line is redacted. Each check run uses fresh identity ids, so its rows in
// the test database are its own and are left in place (the preview API has no
// deletion endpoint, and this helper never writes to the database directly).

import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Released backend commit whose preview API this check exercises (lead handoff). */
export const API_COMMIT = '8a35663cf607726cad4adb78d906026d600322c8';
export const API_PORT = 8174;
export const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
const PROJECT = '/home/agentsdock/Projects/learning-companion';
const PYTHON = process.env.LC_PREVIEW_PYTHON ?? join(process.env.LC_LEAD_REPO ?? join(PROJECT, 'repo'), '.venv', 'bin', 'python');
const DSN_FILE = process.env.LC_TEST_DATABASE_DSN_FILE ?? join(PROJECT, 'automation', 'local-test-postgres', 'test-database.dsn');

export const newToken = () => randomBytes(32).toString('base64url');

/**
 * Only the dedicated local test database is acceptable: `lc_p0_test` over a Unix socket or
 * loopback. Returns what was found (never the DSN itself) or a reason to refuse.
 */
function checkTarget(dsn) {
  let fields;
  if (/^postgres(ql)?:\/\//.test(dsn)) {
    const url = new URL(dsn);
    fields = { dbname: decodeURIComponent(url.pathname.slice(1)), host: url.searchParams.get('host') ?? decodeURIComponent(url.hostname) };
  } else {
    fields = {};
    for (const match of dsn.matchAll(/(\w+)\s*=\s*('(?:[^'\\]|\\.)*'|\S*)/g)) {
      fields[match[1]] = match[2].startsWith("'") ? match[2].slice(1, -1).replace(/\\(.)/g, '$1') : match[2];
    }
  }
  const host = fields.host ?? '';
  const hostKind = host === '' || host.startsWith('/') ? 'unix_socket' : ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host) ? 'loopback' : null;
  if (fields.dbname !== 'lc_p0_test') return { refused: 'the test database handoff does not name the dedicated database lc_p0_test' };
  if (!hostKind) return { refused: 'the test database handoff is not a local socket or loopback address' };
  return { database: fields.dbname, hostKind };
}

/** Calls `say` once per complete line, so a secret split across chunks is still redacted. */
function lines(stream, say) {
  let rest = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const parts = (rest + chunk).split(/\r?\n/);
    rest = parts.pop() ?? '';
    for (const line of parts) if (line.trim()) say(line);
  });
  stream.on('end', () => {
    if (rest.trim()) say(rest);
  });
}

const portInUse = (port) =>
  new Promise((ok) => {
    const socket = connect({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      ok(true);
    });
    socket.on('error', () => ok(false));
  });

/**
 * Prepares the API. Resolves to { blocked: reason } when the environment does not
 * permit a real run (never to a stand-in).
 */
export async function prepareApi({ moduleDir, uiOrigin, note }) {
  if (!existsSync(DSN_FILE)) return { blocked: `the local test database handoff (${DSN_FILE}) is not present` };
  if (!existsSync(PYTHON)) return { blocked: `the backend Python environment (${PYTHON}) is not present` };
  if (await portInUse(API_PORT)) return { blocked: `port ${API_PORT} is already in use; not talking to an unknown server` };
  const dsn = readFileSync(DSN_FILE, 'utf8').trim();
  if (!dsn) return { blocked: 'the local test database handoff is empty' };
  const target = checkTarget(dsn);
  if (target.refused) return { blocked: target.refused };
  const secrets = [dsn];
  const redact = (text) => secrets.reduce((out, secret) => out.split(secret).join('[redacted]'), String(text));
  const say = (line) => note(redact(line));

  const dir = mkdtempSync(join(tmpdir(), 'lc-web-preview-api-'));
  try {
    execFileSync('bash', ['-c', 'set -o pipefail; top=$(git -C "$1" rev-parse --show-toplevel) && git -C "$top" archive "$2" services packages | tar -x -C "$3"', '_', moduleDir, API_COMMIT, dir], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    return { blocked: `could not export backend commit ${API_COMMIT}: ${String(error.stderr ?? error).trim()}` };
  }
  const run = randomBytes(4).toString('hex');
  const identity = { user_id: `webchk-${run}-user`, device_id: `webchk-${run}-device`, session_id: `webchk-${run}-session` };
  say(`preview API: backend ${API_COMMIT} exported to a temporary directory; identity ${JSON.stringify(identity)}`);

  let child = null;
  let generation = 0;
  const start = async (token) => {
    if (child) throw new Error('API already running');
    secrets.push(token);
    generation += 1;
    const label = `api#${generation}`;
    const env = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: process.env.HOME ?? '/tmp',
      LANG: 'C.UTF-8',
      PYTHONDONTWRITEBYTECODE: '1',
      LC_ENABLE_DOCUMENT_PREVIEW: '1',
      LC_DATABASE_URL: dsn,
      LC_PREVIEW_TOKEN: token,
      LC_PREVIEW_USER_ID: identity.user_id,
      LC_PREVIEW_DEVICE_ID: identity.device_id,
      LC_PREVIEW_SESSION_ID: identity.session_id,
      LC_PREVIEW_UI_ORIGIN: uiOrigin,
    };
    const proc = spawn(PYTHON, ['-m', 'services.api.preview_local', '--port', String(API_PORT)], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child = proc;
    let exited = false;
    lines(proc.stdout, (line) => say(`${label}: ${line}`));
    lines(proc.stderr, (line) => say(`${label}: ${line}`));
    proc.on('exit', (code, signal) => {
      exited = true;
      say(`${label} exited (${code ?? signal})`);
      if (child === proc) child = null;
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !exited) {
      try {
        const r = await fetch(`${API_ORIGIN}/preview/v1/session`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.status === 200) {
          say(`${label} ready (GET /preview/v1/session 200)`);
          return;
        }
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`${label} did not become ready`);
  };
  const stop = async () => {
    const proc = child;
    if (!proc) return;
    const gone = new Promise((ok) => proc.once('exit', ok));
    proc.kill('SIGINT'); // the launcher's documented Ctrl-C stop
    const timer = setTimeout(() => proc.kill('SIGKILL'), 10000);
    await gone;
    clearTimeout(timer);
  };
  /** Reads a saved item directly from the API (outside the browser). */
  const readback = async (noteId, token) => {
    const r = await fetch(`${API_ORIGIN}/preview/v1/saves/${encodeURIComponent(noteId)}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: r.status === 200 ? await r.json() : null };
  };
  const close = async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  };
  return { identity, database: target.database, hostKind: target.hostKind, start, stop, readback, close, redact, addSecret: (secret) => void secrets.push(secret) };
}
