// Requests from this app's main process to a trusted local host on the loopback interface, over node:http.
// Only the headers given, plus Host (exactly <host>:<port>) and Content-Length: never Origin or sec-fetch-*, which
// the released desktop host refuses (and which the platform fetch always adds). No redirect is followed and no
// connection is reused. A refused connection (ECONNREFUSED) means nothing was sent; any failure after the connection
// was made may have delivered the request.
import { request } from 'node:http';

export type LoopbackRequest = {
  readonly method: 'GET' | 'PUT' | 'POST';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
  readonly signal?: AbortSignal;
  /** No answer within this long ends the request (ETIMEDOUT; it may have been delivered). Default 60 s. */
  readonly timeout_ms?: number;
};
export type LoopbackAnswer = { readonly status: number; readonly text: string };
export type Transport = (r: LoopbackRequest) => Promise<LoopbackAnswer>;

/** An answer longer than this is not read (the released receipts and ACKs are far smaller). */
const MAX_ANSWER_BYTES = 8 * 1024 * 1024;
const failed = (code: string, what: string): Error => Object.assign(new Error(what), { code });

export const loopbackTransport: Transport = (r) =>
  new Promise((resolve, reject) => {
    const url = new URL(r.url);
    const body = r.body === null ? null : Buffer.from(r.body, 'utf8');
    const req = request(
      {
        host: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: r.method,
        agent: false,
        headers: { ...r.headers, Host: url.host, ...(body ? { 'Content-Length': String(body.length) } : {}) },
        timeout: r.timeout_ms ?? 60_000,
        ...(r.signal ? { signal: r.signal } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_ANSWER_BYTES) req.destroy(failed('ERR_ANSWER_TOO_LARGE', 'the answer is too large'));
          else chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(failed('ETIMEDOUT', 'no answer in time')));
    req.on('error', reject);
    req.end(body ?? undefined);
  });

/** The code a failed request carries (node:http puts it on the error, fetch-like transports on its cause). */
export const errorCode = (error: unknown): unknown => (error as { code?: unknown })?.code ?? (error as { cause?: { code?: unknown } })?.cause?.code;
