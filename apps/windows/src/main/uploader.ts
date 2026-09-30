// Sends retained Windows originals and a prepared WindowsFrameBatchRequest 0.2.10 to the released Backend over HTTP.
// Main process only: a trusted caller (not a renderer, page or course content) supplies an already-authorized runtime
// on the loopback interface, an ephemeral bearer and its expiry, the immutable owner/source and capture incarnation,
// and the exact request prepared by frame-ingress.ts with its original bindings. Nothing here provisions accounts,
// grants consent or starts capture, and nothing is persisted: the token is used for these requests only. Everything
// the caller supplied is copied once at the start, so what is checked is what is used.
//
// 1. Before anything is sent, every original named by the plan is read from the capture folder: it must be a regular
//    file (no link) inside that folder, with exactly the binding's length and SHA-256; every artifact of every record
//    must have its original. The request must be for this owner and incarnation. An original is read through the
//    file it opened, which must be the file checked at its path (same device and file ID): a file put in its place
//    after the check is not read. (Node has no openat, so separate path lookups cannot be made one atomic step: a
//    process that can rewrite the capture folder and flips a folder link between two lookups is not excluded. Even
//    then only bytes with exactly the binding's length and SHA-256 are sent.)
// 2. The originals are sent, one by one (PUT /v2/process/originals/{id}, OriginalArtifactUpload 0.2.2), each checked
//    again just before it is sent; each receipt must be exactly its original, bytes_committed.
// 3. The batch is sent as its exact bytes with its Idempotency-Key (POST /v2/process/windows-frames:batch). It is
//    reported committed only when the ACK (ProcessBatchAck 0.2.0) answers exactly its records, sequences and
//    artifacts, all verified.
//
// Only two kinds of answer are believed: a 200 whose receipt or ACK corresponds exactly, and a typed refusal of the
// released contract (its closed error object, in the route's contract version, with a released code for its
// status). Anything else (no answer, 503, a 200 that does not correspond, a redirect, which is not followed, or any
// other reply) may have been preceded by a commit, so the same bytes are sent again with the same key (bounded, with a
// pause); if still not known, the result is unknown and names the send in doubt. A refusal ends the upload and is
// never resumed here; after a send in doubt it does not make the outcome known, so the result stays unknown.
// Cancellation stops at once; originals already committed stay committed (nothing is rolled back) and nothing local
// is removed. No text from the network is put in a result: only its status and a released error code.

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, type BigIntStats } from 'node:fs';
import { isAbsolute, join, sep } from 'node:path';
import { MAX_ORIGINAL_BYTES, type ArtifactReference, type IngressPlan, type IngressRequest, type SourceRef, type WindowsFrameBatchRequest } from '../shared/frame-ingress.ts';

export type UploadAuthority = {
  /** The runtime's origin: http on the loopback interface only, `http://127.0.0.1:<port>` or `http://[::1]:<port>`. */
  readonly origin: string;
  /** The ephemeral bearer for this runtime; never logged, stored or put in a result. */
  readonly token: string;
  readonly expires_at: string;
  readonly owner: SourceRef;
  readonly incarnation: { readonly device_id: string; readonly session_id: string; readonly stream_id: string };
};
export type UploadJob = {
  /** The retention record the originals were retained in (captures/<id>), as an absolute path. */
  readonly capture_dir: string;
  readonly plan: IngressPlan;
  readonly prepared: IngressRequest;
};
export type UploadOptions = {
  readonly signal?: AbortSignal;
  /** Sends of one request while its outcome is not known (default 3, at most 10). */
  readonly attempts?: number;
  /** The pause before the n-th send again is n times this (default 500 ms, at most 60 s). */
  readonly pause_ms?: number;
  readonly now?: () => number;
};
type Ack = {
  contract_version: string;
  batch_id: string;
  user_id: string;
  device_id: string;
  session_id: string;
  stream_id: string;
  acknowledged: Array<{ record_id: string; sequence: number; disposition: string; received_at: string; envelope: string; artifacts: Array<ArtifactReference & { status: string }> }>;
};
/**
 * `originals`: the artifact IDs whose receipts were exact (committed). `in_doubt`: the artifact ID, or 'batch', of
 * the send without a believable answer, which may have arrived. `error` is only ever a released error code.
 */
export type UploadResult =
  | { status: 'committed'; ack: Ack; originals: string[] }
  /**
   * Known not taken by this call: a typed refusal of the released contract, with no send of that request in doubt
   * before it. If an earlier call left this job unknown or in doubt, that doubt still stands.
   */
  | { status: 'refused'; stage: 'local' | 'original' | 'batch'; reason: string; http_status?: number; error?: string; originals: string[] }
  /**
   * Not known whether it arrived: send the same job again later (the same bytes and key) when permitted. A refusal
   * after a send in doubt is kept in http_status/error; it is not resumed here.
   */
  | { status: 'unknown'; stage: 'original' | 'batch'; reason: string; http_status?: number; error?: string; in_doubt?: string; originals: string[] }
  | { status: 'cancelled'; stage: 'local' | 'original' | 'batch'; in_doubt?: string; originals: string[] };

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const TOKEN = /^[A-Za-z0-9._~+/-]+=*$/;
/** The released Identifier (idempotency keys and artifact IDs alike). */
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
/** The contract version of the typed errors of each route (capture_ingress 0.2.4; Windows ingress 0.2.10). */
const ORIGINAL_ERRORS = '0.2.4';
const BATCH_ERRORS = '0.2.10';
const SHA = /^[a-f0-9]{64}$/;
/** The released ingress error codes by status (capture_ingress ERROR_CODES; the Windows 0.2.10 route has the same). */
const ERROR_CODES: ReadonlyMap<number, readonly string[]> = new Map([
  [400, ['invalid_json']],
  [401, ['unauthenticated']],
  [403, ['forbidden', 'capability_required']],
  [404, ['not_found']],
  [409, ['source_identity_conflict', 'record_conflict', 'idempotency_conflict', 'dependency_missing', 'stale_scope', 'capture_stopped', 'unsupported_source']],
  [413, ['payload_too_large']],
  [415, ['unsupported_media_type']],
  [422, ['unsupported_version', 'invalid_request']],
  [503, ['unavailable']],
]);
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
/** An object with exactly these members (sorted, comma-joined), as the released contract's closed objects are. */
const exactly = (o: unknown, keys: string): o is Record<string, unknown> =>
  typeof o === 'object' && o !== null && !Array.isArray(o) && Object.keys(o).sort().join() === keys;
const sameSource = (a: SourceRef, b: SourceRef): boolean => a.user_id === b.user_id && a.source_id === b.source_id && a.source_version === b.source_version;
const sameArtifact = (a: ArtifactReference, b: ArtifactReference): boolean =>
  a.artifact_id === b.artifact_id && a.sha256 === b.sha256 && a.byte_length === b.byte_length && a.media_type === b.media_type;

/** A released UtcTimestamp: an RFC 3339 date-time in UTC ('Z') naming a real calendar date and time; any fraction. */
export function isUtcTimestamp(t: unknown): boolean {
  const m = typeof t === 'string' ? /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?Z$/.exec(t) : null;
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return y >= 1 && days !== undefined && d >= 1 && d <= days && h <= 23 && mi <= 59 && s <= 59; // year 0 is not a date there
}

/** The released code of a typed error answer (its closed object, the route's version, a code of its status), or null. */
function typedError(status: number, body: unknown, version: string): string | null {
  if (!exactly(body, 'contract_version,error,retryable') || body['contract_version'] !== version) return null;
  const code = (ERROR_CODES.get(status) ?? []).find((c) => c === body['error']);
  return code !== undefined && body['retryable'] === (code === 'unavailable' || code === 'dependency_missing') ? code : null;
}

class Stop extends Error {
  readonly result: UploadResult;
  constructor(result: UploadResult) {
    super('stopped');
    this.result = result;
  }
}

/** Why the authority cannot be used, or null. */
function authorityProblem(a: Pick<UploadAuthority, 'origin' | 'token' | 'expires_at'>, now: number): string | null {
  let url: URL;
  try {
    url = new URL(a.origin);
  } catch {
    return 'the origin is not a URL';
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.port === '' || url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '' || a.origin.replace(/\/$/, '') !== url.origin) {
    return 'only an http origin on the loopback interface (127.0.0.1 or [::1], with a port, nothing else) is supported';
  }
  if (typeof a.token !== 'string' || a.token.length < 32 || a.token.length > 4096 || !TOKEN.test(a.token)) return 'the bearer is malformed';
  if (!isUtcTimestamp(a.expires_at)) return 'the bearer\'s expiry is not a UTC timestamp';
  if (Date.parse(a.expires_at) <= now) return 'the bearer has expired';
  return null;
}

/** An original to send: the exact facts of its binding, and where it is retained in the capture folder. */
type Original = { readonly kind: 'screen_image' | 'editable_ink'; readonly artifact: ArtifactReference; readonly rel: string };

/** The originals the plan binds, checked against the request, as owned copies of their facts. */
function originalsOf(plan: IngressPlan, sent: WindowsFrameBatchRequest, owner: SourceRef): Original[] {
  const refuse = (reason: string): never => {
    throw new Stop({ status: 'refused', stage: 'local', reason, originals: [] });
  };
  const out = new Map<string, Original>();
  const recordArtifacts = new Map(sent.batch.records.map((r) => [r.record_id, r.artifacts]));
  for (const e of plan.entries) {
    if (e.kind !== 'frame') continue;
    const artifacts = recordArtifacts.get(e.record_id);
    if (!artifacts) refuse(`record ${e.record_id} is not in the prepared request`);
    for (const b of [e.raw, e.composed, e.ink]) {
      if (b === null || b === undefined) continue;
      const a = b.artifact;
      const place = b.kind === 'screen_image' ? { media: 'image/png', rel: `frames/${a?.sha256}.png` } : b.kind === 'editable_ink' ? { media: 'application/json', rel: `ink/${a?.sha256}.json` } : null;
      if (!place || b.contract_version !== '0.2.2' || !exactly(a, 'artifact_id,byte_length,media_type,sha256') || typeof a.artifact_id !== 'string' || !IDENTIFIER.test(a.artifact_id) || !SHA.test(a.sha256) || !Number.isSafeInteger(a.byte_length) || a.byte_length < 0 || a.byte_length > MAX_ORIGINAL_BYTES || a.media_type !== place.media) {
        return refuse(`a binding of record ${e.record_id} is not a retained PNG or editable-ink original`);
      }
      if (!exactly(b.source, 'source_id,source_version,user_id') || !sameSource(b.source, owner)) refuse(`the original ${a.artifact_id} belongs to another source`);
      if (!artifacts!.some((x) => sameArtifact(x, a))) refuse(`the original ${a.artifact_id} is not on record ${e.record_id}`);
      const known = out.get(a.artifact_id);
      if (known && (!sameArtifact(known.artifact, a) || known.kind !== b.kind)) refuse(`artifact ID ${a.artifact_id} names two originals`);
      out.set(a.artifact_id, { kind: b.kind, artifact: { artifact_id: a.artifact_id, sha256: a.sha256, byte_length: a.byte_length, media_type: a.media_type }, rel: place.rel });
    }
  }
  for (const r of sent.batch.records) {
    for (const a of r.artifacts) if (!out.has(a.artifact_id)) refuse(`artifact ${a.artifact_id} of record ${r.record_id} has no original to send`);
  }
  return [...out.values()];
}

/**
 * The exact bytes of a retained original. The path must name a regular file (no link) whose real path is inside the
 * capture folder; the file opened must be that file (same device and file ID, both known), of the binding's length,
 * and it is read through what was opened. The bytes must have the binding's length and SHA-256.
 */
function readOriginal(root: string, rootReal: string, o: Original, stage: 'local' | 'original', originals: readonly string[]): Uint8Array {
  const a = o.artifact;
  const refuse = (why: string): never => {
    throw new Stop({ status: 'refused', stage, reason: `the original ${a.artifact_id} (${o.rel}) ${why}; nothing is sent for it`, originals: [...originals] });
  };
  const file = join(root, o.rel);
  // What the path names now: a regular file (not a link) whose real path is inside the capture folder as resolved at
  // the start (if the folder itself is moved or replaced by a link, its files resolve elsewhere and are refused).
  const named = (): BigIntStats => {
    let st: BigIntStats;
    try {
      st = lstatSync(file, { bigint: true });
    } catch {
      return refuse('is not in the capture folder');
    }
    if (!st.isFile()) refuse('is not a regular file');
    let real: string;
    try {
      real = realpathSync(file);
    } catch {
      return refuse('cannot be resolved');
    }
    if (!real.startsWith(rootReal + sep)) refuse('is outside the capture folder');
    return st;
  };
  const same = (x: BigIntStats, y: BigIntStats): boolean => x.dev === y.dev && x.ino === y.ino;
  const checked = named();
  if (checked.size !== BigInt(a.byte_length)) refuse(`has ${checked.size} bytes, not ${a.byte_length}`);
  // As Node's own fs.cp does, a zero device or file ID is not an identity: the file opened could not be matched.
  if (checked.dev === 0n || checked.ino === 0n) refuse('has no file identity on this file system, so the file opened could not be matched to it');
  let fd: number;
  try {
    // No-follow and non-blocking where the platform has them (a link or a pipe put in its place is not opened as it);
    // everywhere, the identity check below is what binds the bytes read to the file checked.
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch {
    return refuse('cannot be opened');
  }
  let data: Uint8Array | null = null;
  try {
    let opened: BigIntStats | null = null;
    try {
      opened = fstatSync(fd, { bigint: true });
    } catch {
      opened = null;
    }
    if (!opened || !opened.isFile() || !same(opened, checked)) refuse('was replaced after it was checked');
    if (opened!.size !== BigInt(a.byte_length)) refuse('changed length after it was checked');
    try {
      data = readFileSync(fd);
    } catch {
      data = null;
    }
    if (!data) refuse('cannot be read');
  } finally {
    closeSync(fd);
  }
  if (!data || data.length !== a.byte_length || sha256(data) !== a.sha256) refuse('does not have its SHA-256');
  return data!;
}

/**
 * Why an ACK does not answer exactly the batch sent, or null: the closed ProcessBatchAck 0.2.0 shape, and the
 * Backend's own correspondence rules (every record once with its sequence; exactly its artifacts, once each), with
 * every record committed and every artifact verified.
 */
export function ackProblem(sent: WindowsFrameBatchRequest, ack: unknown, owner: SourceRef): string | null {
  if (!exactly(ack, 'acknowledged,batch_id,contract_version,device_id,session_id,stream_id,user_id') || ack['contract_version'] !== '0.2.0') return 'it is not a ProcessBatchAck 0.2.0';
  for (const k of ['batch_id', 'device_id', 'session_id', 'stream_id'] as const) if (ack[k] !== sent.batch[k]) return `its ${k} is not the batch's`;
  if (ack['user_id'] !== owner.user_id) return 'it is for another owner';
  const acknowledged = ack['acknowledged'];
  if (!Array.isArray(acknowledged) || acknowledged.length !== sent.batch.records.length) return 'it does not answer every record';
  const records = new Map(sent.batch.records.map((r) => [r.record_id, r]));
  const seen = new Set<unknown>();
  for (const r of acknowledged as unknown[]) {
    if (!exactly(r, 'artifacts,disposition,envelope,received_at,record_id,sequence')) return 'a receipt is not a ProcessReceipt';
    const record = records.get(r['record_id'] as string);
    if (!record || seen.has(r['record_id'])) return 'it answers a record not sent, or one twice';
    seen.add(r['record_id']);
    const id = record.record_id;
    if (r['sequence'] !== record.sequence || r['envelope'] !== 'committed' || !['accepted', 'duplicate'].includes(r['disposition'] as string) || !isUtcTimestamp(r['received_at'])) return `its receipt for ${id} is not committed as sent`;
    const artifacts = r['artifacts'];
    if (!Array.isArray(artifacts) || artifacts.length !== record.artifacts.length) return `its receipt for ${id} does not list exactly its artifacts`;
    const listed = new Set<unknown>();
    for (const x of artifacts as unknown[]) {
      if (!exactly(x, 'artifact_id,byte_length,media_type,sha256,status')) return `its receipt for ${id} has an artifact that is not an ArtifactReceipt`;
      const ref = record.artifacts.find((y) => y.artifact_id === x['artifact_id']);
      if (!ref || listed.has(ref.artifact_id)) return `its receipt for ${id} does not list exactly its artifacts`;
      listed.add(ref.artifact_id);
      if (!sameArtifact(ref, x as unknown as ArtifactReference) || x['status'] !== 'verified') return `its receipt for ${id} has an artifact not verified as sent`;
    }
  }
  return null;
}

/** Why a receipt is not exactly the original uploaded, bytes_committed, or null. */
function receiptProblem(receipt: unknown, upload: { source: SourceRef; kind: string; artifact: ArtifactReference }): string | null {
  const exact = exactly(receipt, 'artifact,contract_version,kind,source,status') && exactly(receipt['source'], 'source_id,source_version,user_id') && exactly(receipt['artifact'], 'artifact_id,byte_length,media_type,sha256');
  return exact && receipt['contract_version'] === '0.2.2' && receipt['status'] === 'bytes_committed' && receipt['kind'] === upload.kind && sameSource(receipt['source'] as SourceRef, upload.source) && sameArtifact(receipt['artifact'] as ArtifactReference, upload.artifact)
    ? null
    : 'its receipt is not exactly its original, bytes_committed';
}

/** A believed answer: a corresponding 200, or a typed refusal; anything else is not known. Network text is not kept. */
type Answer = { kind: 'ok'; body: unknown } | { kind: 'refused'; status: number; error: string } | { kind: 'unknown'; reason: string; status?: number };

function classify(status: number, raw: string, check: (body: unknown) => string | null, version: string): Answer {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    body = undefined;
  }
  if (status === 200) {
    const problem = body === undefined ? 'it is not JSON' : check(body);
    return problem ? { kind: 'unknown', status, reason: `answered 200, but ${problem}` } : { kind: 'ok', body };
  }
  if (status >= 300 && status < 400) return { kind: 'unknown', status, reason: `answered with a redirect (${status}), which is not followed` };
  const code = typedError(status, body, version);
  if (code !== null && code !== 'unavailable') return { kind: 'refused', status, error: code };
  return { kind: 'unknown', status, reason: code ? `answered ${status} ${code}` : `answered ${status}, which is not a reply of the released contract` };
}

/** What a failed fetch says, as a code only (its message can carry network text). */
function failure(error: unknown): string {
  const code = (error as { cause?: { code?: unknown } })?.cause?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,40}$/.test(code) ? code : 'no code';
}

/**
 * Uploads the job's originals, then its batch. The result is committed only with a corresponding ACK; see the module
 * comment for refusals, unknown outcomes and cancellation.
 */
export async function uploadRetained(authority: UploadAuthority, job: UploadJob, options: UploadOptions = {}): Promise<UploadResult> {
  const { now: givenNow, attempts: givenAttempts, pause_ms: givenPause, signal } = options; // each read once
  const now = givenNow ?? Date.now;
  const attempts = typeof givenAttempts === 'number' && Number.isSafeInteger(givenAttempts) ? Math.min(Math.max(givenAttempts, 1), 10) : 3;
  const pause = typeof givenPause === 'number' && Number.isFinite(givenPause) && givenPause >= 0 ? Math.min(givenPause, 60_000) : 500;
  const originals: string[] = [];
  let stage: 'local' | 'original' | 'batch' = 'local';
  let inDoubt: string | undefined; // the send, if any, without a believable answer
  const cancelled = (): UploadResult => ({ status: 'cancelled', stage, ...(inDoubt ? { in_doubt: inDoubt } : {}), originals: [...originals] });
  try {
    if (signal?.aborted) return cancelled();
    // Everything the caller supplied, copied once: what is checked is what is used, whatever its objects do later.
    let given;
    try {
      const { owner: o, incarnation: i, prepared: p } = { owner: authority.owner, incarnation: authority.incarnation, prepared: job.prepared };
      given = structuredClone({
        origin: authority.origin,
        token: authority.token,
        expires_at: authority.expires_at,
        owner: { user_id: o.user_id, source_id: o.source_id, source_version: o.source_version },
        incarnation: { device_id: i.device_id, session_id: i.session_id, stream_id: i.stream_id },
        capture_dir: job.capture_dir,
        plan: job.plan,
        key: p.idempotency_key,
        body: p.body,
        request: p.request,
      });
    } catch {
      return { status: 'refused', stage, reason: 'the authority or job is not plain data', originals };
    }
    const { origin, token, expires_at, owner, incarnation: inc, capture_dir: root, plan, key, body } = given;
    const problem = authorityProblem({ origin, token, expires_at }, now());
    if (problem) return { status: 'refused', stage, reason: problem, originals };
    const base = new URL(origin).origin;
    const expires = Date.parse(expires_at);
    if (typeof key !== 'string' || key !== plan?.idempotency_key || !IDENTIFIER.test(key)) return { status: 'refused', stage, reason: 'the Idempotency-Key is not the plan\'s, or malformed', originals };
    if (typeof body !== 'string' || new TextEncoder().encode(body).length > MAX_BODY_BYTES) return { status: 'refused', stage, reason: 'the prepared body is not text of at most 4 MiB', originals };
    let sent: WindowsFrameBatchRequest;
    try {
      sent = JSON.parse(body) as WindowsFrameBatchRequest;
    } catch {
      return { status: 'refused', stage, reason: 'the prepared body is not JSON', originals };
    }
    if (sent?.contract_version !== '0.2.10' || JSON.stringify(sent) !== JSON.stringify(given.request)) return { status: 'refused', stage, reason: 'the prepared body is not the prepared request', originals };
    if (sent.batch.device_id !== inc.device_id || sent.batch.session_id !== inc.session_id || sent.batch.stream_id !== inc.stream_id) return { status: 'refused', stage, reason: 'the request is for another capture incarnation', originals };
    if (!sent.batch.records.every((r) => exactly(r.source, 'source_id,source_version,user_id') && sameSource(r.source, owner))) return { status: 'refused', stage, reason: 'a record is for another owner or source', originals };
    let rootReal: string;
    try {
      if (typeof root !== 'string' || !isAbsolute(root)) throw new Error('not absolute');
      rootReal = realpathSync(root);
    } catch {
      return { status: 'refused', stage, reason: 'the capture folder is not an absolute path that resolves', originals };
    }
    const list = originalsOf(plan, sent, owner);
    for (const o of list) readOriginal(root, rootReal, o, 'local', originals); // all checked before anything is sent

    /** Sends one request; the same bytes again while its outcome is not known. `what` is the artifact ID or 'batch'. */
    const request = async (what: string, method: 'PUT' | 'POST', path: string, text: string, headers: Record<string, string>, check: (body: unknown) => string | null, version: string): Promise<Answer> => {
      for (let n = 1; ; n++) {
        if (signal?.aborted) throw new Stop(cancelled());
        if (expires <= now()) {
          if (inDoubt) throw new Stop({ status: 'unknown', stage: stage as 'original' | 'batch', reason: `${what === 'batch' ? 'the batch' : `the original ${what}`} was sent without a believable answer, and the bearer expired before it could be sent again; send the same job again with a new bearer`, in_doubt: inDoubt, originals: [...originals] });
          throw new Stop({ status: 'refused', stage, reason: 'the bearer has expired', originals: [...originals] });
        }
        let answer: Answer;
        try {
          const res = await fetch(`${base}${path}`, {
            method,
            body: text,
            redirect: 'manual',
            ...(signal ? { signal } : {}),
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8', ...headers },
          });
          answer = classify(res.status, await res.text(), check, version);
        } catch (error) {
          inDoubt = what; // sent (or being sent) without an answer
          if (signal?.aborted) throw new Stop(cancelled());
          answer = { kind: 'unknown', reason: `no answer (${failure(error)})` };
        }
        if (answer.kind !== 'unknown') return answer;
        // Not known whether it arrived: the same bytes are sent again.
        inDoubt = what;
        if (n >= attempts) return answer;
        await new Promise<void>((resolve) => {
          if (signal?.aborted) return resolve();
          const t = setTimeout(resolve, pause * n);
          signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
        });
      }
    };
    const settle = (answer: Answer, what: string): UploadResult | null => {
      if (answer.kind === 'ok') return null;
      const partial = { stage: stage as 'original' | 'batch', originals: [...originals] };
      if (answer.kind === 'unknown') {
        return { status: 'unknown', ...partial, reason: `${what}: ${answer.reason}; not known whether it arrived, send the same job again`, ...(answer.status ? { http_status: answer.status } : {}), in_doubt: inDoubt! };
      }
      const detail = { http_status: answer.status, error: answer.error };
      if (answer.error === 'dependency_missing') return { status: 'unknown', ...partial, reason: `${what}: ${answer.status} ${answer.error}; send the same job again later`, ...detail, ...(inDoubt ? { in_doubt: inDoubt } : {}) };
      // A send of this request without a believable answer may have arrived, whatever this answer says.
      if (inDoubt) return { status: 'unknown', ...partial, reason: `${what} was sent without a believable answer, then refused: ${answer.status} ${answer.error}; whether it arrived is not known, and it is not resumed here`, ...detail, in_doubt: inDoubt };
      return { status: 'refused', stage, reason: `${what} was refused: ${answer.status} ${answer.error}`, ...detail, originals: [...originals] };
    };

    stage = 'original';
    for (const o of list) {
      const a = o.artifact;
      const data = readOriginal(root, rootReal, o, 'original', originals); // exactly what was checked, read again now
      const upload = { contract_version: '0.2.2', source: owner, kind: o.kind, artifact: a, data_base64: Buffer.from(data).toString('base64') };
      const answer = await request(a.artifact_id, 'PUT', `/v2/process/originals/${encodeURIComponent(a.artifact_id)}`, JSON.stringify(upload), {}, (receipt) => receiptProblem(receipt, upload), ORIGINAL_ERRORS);
      const unsettled = settle(answer, `the original ${a.artifact_id}`);
      if (unsettled) return unsettled;
      originals.push(a.artifact_id);
      inDoubt = undefined;
    }

    stage = 'batch';
    const answer = await request('batch', 'POST', '/v2/process/windows-frames:batch', body, { 'Idempotency-Key': key }, (ack) => {
      const mismatch = ackProblem(sent, ack, owner);
      return mismatch ? `the ACK does not answer the batch sent: ${mismatch}` : null;
    }, BATCH_ERRORS);
    const unsettled = settle(answer, 'the batch');
    if (unsettled) return unsettled;
    return { status: 'committed', ack: (answer as { body: Ack }).body, originals: [...originals] };
  } catch (error) {
    if (error instanceof Stop) return error.result;
    // Before anything is sent, a job that cannot even be read as prepared is refused. Later, an unexpected error still
    // ends in a result: nothing more is sent, what was committed is listed, and a send in doubt stays in doubt.
    if (stage === 'local') return { status: 'refused', stage, reason: 'the prepared job is malformed', originals: [] };
    const name = error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : 'error';
    const reason = `stopped by an unexpected local error (${name}); nothing more is sent`;
    return inDoubt ? { status: 'unknown', stage, reason, in_doubt: inDoubt, originals: [...originals] } : { status: 'refused', stage, reason, originals: [...originals] };
  }
}
