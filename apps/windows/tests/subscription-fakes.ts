// A stand-in for the subscription connector, for tests. SYNTHETIC: no Codex, no ChatGPT, no sign-in and no network are
// involved; it speaks the private envelope lc-subscription-ask/1 (docs/adr/0003) over in-process streams and answers
// what a test tells it to. An "answer" here is text the test wrote, never a model's.
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';
import { provenanceOf, type AskRequest } from '../src/shared/subscription-ask.ts';

export const ACCOUNT = {
  auth: { state: 'signed_in', mode: 'chatgpt', plan: 'Pro' },
  rate_limits: [{ label: '5 h', used_percent: 12.4, resets_at: '2026-10-01T10:00:00Z' }],
  models: [
    { id: 'text-only-model', label: 'Text only', image_input: false, default: true },
    { id: 'vision-model', label: 'Vision', image_input: true, default: false },
  ],
};
export const LOGIN_URL = 'https://auth.openai.com/oauth/authorize?client=synthetic';
type Call = { id: string; method: string; params: Record<string, unknown> };

export class FakeConnector extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly pid = 5_000_000 + Math.floor(Math.random() * 1000);
  /** Every request received, in order. */
  readonly calls: Call[] = [];
  account: unknown = ACCOUNT;
  loginUrl = LOGIN_URL;
  /**
   * ask/start is held until a test answers it. A cancel or a Stop then ends it as the released connector does: the
   * question itself as `cancelled`; whether the interruption was confirmed is in the cancel's own answer
   * (`uncertain`), or the Stop's (`interrupt_unconfirmed`). `silent`: the cancel is answered, the question is not.
   */
  onCancel: 'confirmed' | 'unconfirmed' | 'silent' = 'confirmed';
  /** How long after the end of its input it takes to end (the released connector closes its Codex child first). */
  endDelayMs = 0;
  exited = false;
  private buffer = '';
  constructor() {
    super();
    this.stdin.on('data', (c: Buffer) => {
      this.buffer += c.toString('utf8');
      for (let nl = this.buffer.indexOf('\n'); nl >= 0; nl = this.buffer.indexOf('\n')) {
        const line = this.buffer.slice(0, nl);
        this.buffer = this.buffer.slice(nl + 1);
        this.receive(JSON.parse(line) as Call & { version: string });
      }
    });
    this.stdin.on('end', () => (this.endDelayMs ? void setTimeout(() => this.exit(0), this.endDelayMs) : this.exit(0))); // the end of its input ends it
    process.nextTick(() => this.emit('spawn'));
  }
  private receive(m: Call & { version: string }): void {
    if (m.version !== 'lc-subscription-ask/1') return this.fail(m.id, 'invalid_request');
    this.calls.push({ id: m.id, method: m.method, params: m.params });
    if (m.method === 'connection/read') return this.account === null ? undefined : this.reply(m.id, this.account); // null: the test answers by hand
    if (m.method === 'connection/login/start') return this.reply(m.id, { login_id: 'login-1', auth_url: this.loginUrl });
    if (m.method === 'connection/login/cancel') return this.reply(m.id, {});
    if (m.method === 'ask/cancel' || m.method === 'session/stop') {
      const ask = this.held();
      if (m.method === 'ask/cancel') this.reply(m.id, { cancelled: ask !== null, uncertain: ask !== null && this.onCancel === 'unconfirmed' });
      else if (ask && this.onCancel === 'unconfirmed') this.fail(m.id, 'interrupt_unconfirmed');
      else this.reply(m.id, {});
      if (ask && this.onCancel !== 'silent') this.fail(ask.id, 'cancelled');
      return;
    }
    // ask/start: held until the test answers it.
  }
  /** Ids already answered: a held question is answered once. */
  private readonly answered = new Set<string>();
  /** The question that is out and not yet answered, if any. */
  private held(): Call | null {
    const ask = this.asks().at(-1);
    return ask && !this.answered.has(ask.id) ? ask : null;
  }
  private write(v: unknown): void {
    if (!this.exited) this.stdout.write(`${JSON.stringify(v)}\n`);
  }
  reply(id: string, result: unknown): void {
    this.answered.add(id);
    this.write({ id, result });
  }
  fail(id: string, code: string, message = 'a raw message that must never be shown'): void {
    this.answered.add(id);
    this.write({ id, error: { code, message } });
  }
  event(method: string, params: unknown): void {
    this.write({ method, params });
  }
  asks(): Call[] {
    return this.calls.filter((c) => c.method === 'ask/start');
  }
  count(method: string): number {
    return this.calls.filter((c) => c.method === method).length;
  }
  /** Completes the newest held question with `text`, bound to exactly what was asked (or `change` applied to it). */
  answer(text: string, change: (result: Record<string, unknown>) => void = () => undefined, call: Call = this.asks().at(-1)!): void {
    const request = call.params['request'] as AskRequest;
    const result: Record<string, unknown> = { request_id: request.request_id, text, provenance: provenanceOf(request), model: call.params['model'], auth_mode: 'chatgpt', latency_ms: 1234, thread_id: 'thread-synthetic-1', turn_id: 'turn-synthetic-1' };
    change(result);
    this.reply(call.id, result);
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

/** A spawn that makes fake connectors, each kept in `made` with the command line and environment it was given. */
export function fakeConnectors(configure: (c: FakeConnector) => void = () => undefined) {
  const made: FakeConnector[] = [];
  const launches: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv; options: object }> = [];
  const spawnFake = ((command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
    launches.push({ command, args, env: options.env, options });
    const c = new FakeConnector();
    configure(c);
    made.push(c);
    return c;
  }) as unknown as typeof spawn;
  return { spawn: spawnFake, made, launches, last: (): FakeConnector => made.at(-1)! };
}

const temps: string[] = [];
export const removeConfigs = (): void => temps.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
/** A connector configuration file (its launch is never run: tests give the app a fake spawn). */
export function connectorConfig(extra: object = {}, launch: object = { kind: 'wsl', distribution: 'test-only', user: 'test-only', cd: '/synthetic/backend', python: '/synthetic/python' }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-sub-config-'));
  temps.push(dir);
  const file = path.join(dir, 'connector.json');
  fs.writeFileSync(file, JSON.stringify({ format: 'lc-windows-subscription-connector/v1', launch, ...extra }));
  return file;
}
