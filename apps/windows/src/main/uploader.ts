// Sends retained Windows originals and a prepared WindowsFrameBatchRequest 0.2.10 to the released Backend over HTTP.
// Main process only: a trusted caller (not a renderer, page or course content) supplies an already-authorized runtime
// on the loopback interface, an ephemeral bearer and its expiry, the immutable owner/source and capture incarnation,
// and the exact request prepared by frame-ingress.ts with its original bindings. Nothing here provisions accounts,
// grants consent or starts capture, and nothing is persisted: the token is used for these requests only.
//
// 1. Before anything is sent, every original named by the plan is read from the capture folder: it must be a regular
//    file (no link) inside that folder, with exactly the binding's length and SHA-256; every artifact of every record
//    must have its original. The request must be for this owner and incarnation.
// 2. The originals are sent, one by one (PUT /v2/process/originals/{id}, OriginalArtifactUpload 0.2.2), each checked
//    again just before it is sent; each receipt must be exactly its original, bytes_committed.
// 3. The batch is sent as its exact bytes with its Idempotency-Key (POST /v2/process/windows-frames:batch). It is
//    reported committed only when the ACK (ProcessBatchAck 0.2.0) answers exactly its records, sequences and
//    artifacts, all verified.
//
// A lost answer, a dropped connection or 503 is sent again as the same bytes with the same key (bounded, with a
// pause); if still unknown, the result says so and the same job can be sent later. A refusal (authentication,
// permission, Stop, conflict, invalid) ends the upload and is never resumed here. Redirects are refused. Cancellation
// stops at once; originals already committed stay committed (nothing is rolled back) and nothing local is removed.
// Once a send has gone without an answer, it may have arrived: a later refusal, expiry or cancellation of that request
// does not make it known, so the result is unknown (or cancelled) and names it as in doubt.

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { ArtifactReference, IngressPlan, IngressRequest, OriginalArtifactBinding, SourceRef, WindowsFrameBatchRequest } from '../shared/frame-ingress.ts';

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
  /** The retention record the originals were retained in (captures/<id>). */
  readonly capture_dir: string;
  readonly plan: IngressPlan;
  readonly prepared: IngressRequest;
};
export type UploadOptions = {
  readonly signal?: AbortSignal;
  /** Sends of one request when its outcome is unknown (default 3). */
  readonly attempts?: number;
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
 * `originals`: the artifact IDs whose receipts were exact (committed). `in_doubt`: the artifact ID, or 'batch', whose
 * send went without an answer and so may have arrived.
 */
export type UploadResult =
  | { status: 'committed'; ack: Ack; originals: string[] }
  /** Known not taken: the request was answered with a refusal and had no earlier unanswered send. */
  | { status: 'refused'; stage: 'local' | 'original' | 'batch'; reason: string; http_status?: number; error?: string; originals: string[] }
  /**
   * Not known whether it arrived: send the same job again later (the same bytes and key) when permitted. A refusal
   * after an unanswered send is kept in http_status/error; it is not resumed here.
   */
  | { status: 'unknown'; stage: 'original' | 'batch'; reason: string; http_status?: number; error?: string; in_doubt?: string; originals: string[] }
  | { status: 'cancelled'; stage: 'local' | 'original' | 'batch'; in_doubt?: string; originals: string[] };

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const TOKEN = /^[A-Za-z0-9._~+/-]+=*$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
/** An object with exactly these members (sorted, comma-joined), as the released contract's closed objects are. */
const exactly = (o: unknown, keys: string): o is Record<string, unknown> =>
  typeof o === 'object' && o !== null && !Array.isArray(o) && Object.keys(o).sort().join() === keys;
const sameSource = (a: SourceRef, b: SourceRef): boolean => a.user_id === b.user_id && a.source_id === b.source_id && a.source_version === b.source_version;
const sameArtifact = (a: ArtifactReference, b: ArtifactReference): boolean =>
  a.artifact_id === b.artifact_id && a.sha256 === b.sha256 && a.byte_length === b.byte_length && a.media_type === b.media_type;
const utc = (t: unknown): boolean => typeof t === 'string' && t.endsWith('Z') && !Number.isNaN(Date.parse(t));

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
  const expires = Date.parse(a.expires_at);
  if (Number.isNaN(expires) || expires <= now) return 'the bearer has expired';
  return null;
}

/** The originals the plan binds, checked against the request; where each is retained. */
function originalsOf(job: UploadJob, sent: WindowsFrameBatchRequest, owner: SourceRef): Array<{ binding: OriginalArtifactBinding; rel: string }> {
  const out = new Map<string, { binding: OriginalArtifactBinding; rel: string }>();
  const recordArtifacts = new Map(sent.batch.records.map((r) => [r.record_id, r.artifacts]));
  for (const e of job.plan.entries) {
    if (e.kind !== 'frame') continue;
    const artifacts = recordArtifacts.get(e.record_id);
    if (!artifacts) throw new Stop({ status: 'refused', stage: 'local', reason: `record ${e.record_id} is not in the prepared request`, originals: [] });
    for (const b of [e.raw, e.composed, e.ink]) {
      if (!b) continue;
      const a = b.artifact;
      const rel = b.kind === 'editable_ink' ? `ink/${a.sha256}.json` : `frames/${a.sha256}.png`;
      if (!sameSource(b.source, owner)) throw new Stop({ status: 'refused', stage: 'local', reason: `the original ${a.artifact_id} belongs to another source`, originals: [] });
      if (!artifacts.some((x) => sameArtifact(x, a))) throw new Stop({ status: 'refused', stage: 'local', reason: `the original ${a.artifact_id} is not on record ${e.record_id}`, originals: [] });
      const known = out.get(a.artifact_id);
      if (known && (!sameArtifact(known.binding.artifact, a) || known.binding.kind !== b.kind)) throw new Stop({ status: 'refused', stage: 'local', reason: `artifact ID ${a.artifact_id} names two originals`, originals: [] });
      out.set(a.artifact_id, { binding: b, rel });
    }
  }
  for (const r of sent.batch.records) {
    for (const a of r.artifacts) if (!out.has(a.artifact_id)) throw new Stop({ status: 'refused', stage: 'local', reason: `artifact ${a.artifact_id} of record ${r.record_id} has no original to send`, originals: [] });
  }
  return [...out.values()];
}

/** The exact bytes of a retained original: a regular file inside the capture folder with the binding's length and SHA-256. */
function readOriginal(root: string, rel: string, a: ArtifactReference, stage: 'local' | 'original', originals: string[]): Uint8Array {
  const refuse = (why: string): never => {
    throw new Stop({ status: 'refused', stage, reason: `the original ${a.artifact_id} (${rel}) ${why}; nothing is sent for it`, originals });
  };
  const file = join(root, rel);
  let st;
  try {
    st = lstatSync(file);
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
  let inside = false;
  try {
    inside = real.startsWith(realpathSync(root) + sep);
  } catch {
    return refuse('cannot be resolved');
  }
  if (!inside) refuse('is outside the capture folder');
  if (st.size !== a.byte_length) refuse(`has ${st.size} bytes, not ${a.byte_length}`);
  let data: Uint8Array;
  try {
    data = readFileSync(file);
  } catch {
    return refuse('cannot be read');
  }
  if (data.length !== a.byte_length || sha256(data) !== a.sha256) refuse('does not have its SHA-256');
  return data;
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
    if (r['sequence'] !== record.sequence || r['envelope'] !== 'committed' || !['accepted', 'duplicate'].includes(r['disposition'] as string) || !utc(r['received_at'])) return `its receipt for ${id} is not committed as sent`;
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

type Answer = { kind: 'ok'; body: unknown } | { kind: 'http'; status: number; error: string } | { kind: 'redirect'; status: number } | { kind: 'unknown'; reason: string };

/**
 * Uploads the job's originals, then its batch. The result is committed only with a corresponding ACK; see the module
 * comment for refusals, unknown outcomes and cancellation.
 */
export async function uploadRetained(authority: UploadAuthority, job: UploadJob, options: UploadOptions = {}): Promise<UploadResult> {
  const now = options.now ?? Date.now;
  const attempts = Math.max(1, options.attempts ?? 3);
  const pause = options.pause_ms ?? 500;
  const signal = options.signal;
  const originals: string[] = [];
  let stage: 'local' | 'original' | 'batch' = 'local';
  let inDoubt: string | undefined; // the send, if any, that went without an answer
  const cancelled = (): UploadResult => ({ status: 'cancelled', stage, ...(inDoubt ? { in_doubt: inDoubt } : {}), originals: [...originals] });
  try {
    if (signal?.aborted) return cancelled();
    // What was checked is what is used: the caller's object is not read again.
    const { origin, token, expires_at } = authority;
    const problem = authorityProblem({ origin, token, expires_at }, now());
    if (problem) return { status: 'refused', stage, reason: problem, originals };
    const base = new URL(origin).origin;
    const expires = Date.parse(expires_at);
    const redact = (text: string): string => text.split(token).join('[bearer]');
    const owner: SourceRef = { user_id: authority.owner.user_id, source_id: authority.owner.source_id, source_version: authority.owner.source_version };
    const key = job.prepared.idempotency_key;
    if (key !== job.plan.idempotency_key || !KEY.test(key)) return { status: 'refused', stage, reason: 'the Idempotency-Key is not the plan\'s, or malformed', originals };
    const body = job.prepared.body;
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return { status: 'refused', stage, reason: 'the prepared body is over 4 MiB', originals };
    let sent: WindowsFrameBatchRequest;
    try {
      sent = JSON.parse(body) as WindowsFrameBatchRequest;
    } catch {
      return { status: 'refused', stage, reason: 'the prepared body is not JSON', originals };
    }
    if (sent.contract_version !== '0.2.10' || JSON.stringify(sent) !== JSON.stringify(job.prepared.request)) return { status: 'refused', stage, reason: 'the prepared body is not the prepared request', originals };
    const inc = authority.incarnation;
    if (sent.batch.device_id !== inc.device_id || sent.batch.session_id !== inc.session_id || sent.batch.stream_id !== inc.stream_id) return { status: 'refused', stage, reason: 'the request is for another capture incarnation', originals };
    if (!sent.batch.records.every((r) => sameSource(r.source, owner) && Object.keys(r.source).length === 3)) return { status: 'refused', stage, reason: 'a record is for another owner or source', originals };
    const list = originalsOf(job, sent, owner);
    for (const o of list) readOriginal(job.capture_dir, o.rel, o.binding.artifact, 'local', originals); // all checked before anything is sent

    /** Sends one request; the same bytes again while its outcome is unknown. `what` is the artifact ID or 'batch'. */
    const request = async (what: string, method: 'PUT' | 'POST', path: string, text: string, headers: Record<string, string>): Promise<Answer> => {
      for (let n = 1; ; n++) {
        if (signal?.aborted) throw new Stop(cancelled());
        if (expires <= now()) {
          if (inDoubt) throw new Stop({ status: 'unknown', stage: stage as 'original' | 'batch', reason: `${what} was sent without an answer, and the bearer expired before it could be sent again; send the same job again with a new bearer`, in_doubt: inDoubt, originals: [...originals] });
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
          const raw = await res.text();
          if (res.status >= 300 && res.status < 400) answer = { kind: 'redirect', status: res.status };
          else if (res.status === 200) answer = { kind: 'ok', body: JSON.parse(raw) };
          else {
            let parsed: { error?: unknown } = {};
            try {
              parsed = JSON.parse(raw) as typeof parsed;
            } catch {
              parsed = {};
            }
            answer = { kind: 'http', status: res.status, error: typeof parsed?.error === 'string' ? parsed.error : 'unknown' };
          }
        } catch (error) {
          inDoubt = what; // sent (or being sent) without an answer
          if (signal?.aborted) throw new Stop(cancelled());
          answer = { kind: 'unknown', reason: redact(error instanceof Error ? error.message : String(error)) };
        }
        // Not known whether it arrived (no answer, or the server says try again): the same bytes are sent again.
        const again = answer.kind === 'unknown' || (answer.kind === 'http' && answer.status === 503);
        if (!again || n >= attempts) return answer;
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
      if (answer.kind === 'unknown') return { status: 'unknown', ...partial, reason: `${what}: no answer (${answer.reason}); send the same job again`, in_doubt: inDoubt! };
      if (answer.kind === 'http' && (answer.status === 503 || (answer.status === 409 && answer.error === 'dependency_missing'))) {
        return { status: 'unknown', ...partial, reason: `${what}: ${answer.status} ${answer.error}; send the same job again later`, ...(inDoubt ? { in_doubt: inDoubt } : {}) };
      }
      const why = answer.kind === 'redirect' ? `a redirect (${answer.status}), which is refused` : `${answer.status} ${answer.error}`;
      const detail = { http_status: answer.status, ...(answer.kind === 'http' ? { error: answer.error } : {}) };
      // An earlier send of this request went without an answer: it may have arrived, whatever this answer says.
      if (inDoubt) return { status: 'unknown', ...partial, reason: `${what} was sent without an answer, then refused: ${why}; whether it arrived is not known, and it is not resumed here`, ...detail, in_doubt: inDoubt };
      return { status: 'refused', stage, reason: `${what} was refused: ${why}`, ...detail, originals: [...originals] };
    };

    stage = 'original';
    for (const o of list) {
      const a = o.binding.artifact;
      const data = readOriginal(job.capture_dir, o.rel, a, 'original', originals); // exactly what was checked, read again now
      const upload = { contract_version: '0.2.2', source: owner, kind: o.binding.kind, artifact: { artifact_id: a.artifact_id, sha256: a.sha256, byte_length: a.byte_length, media_type: a.media_type }, data_base64: Buffer.from(data).toString('base64') };
      const what = `the original ${a.artifact_id}`;
      const answer = await request(a.artifact_id, 'PUT', `/v2/process/originals/${encodeURIComponent(a.artifact_id)}`, JSON.stringify(upload), {});
      const unsettled = settle(answer, what);
      if (unsettled) return unsettled;
      const receipt = (answer as { body: unknown }).body;
      const exact = exactly(receipt, 'artifact,contract_version,kind,source,status') && exactly(receipt['source'], 'source_id,source_version,user_id') && exactly(receipt['artifact'], 'artifact_id,byte_length,media_type,sha256');
      if (!exact || receipt['status'] !== 'bytes_committed' || !sameSource(receipt['source'] as SourceRef, owner) || !sameArtifact(receipt['artifact'] as ArtifactReference, upload.artifact) || receipt['kind'] !== upload.kind || receipt['contract_version'] !== '0.2.2') {
        return inDoubt
          ? { status: 'unknown', stage, reason: `${what} was sent without an answer, then answered with a receipt that is not exactly its original, committed`, in_doubt: inDoubt, originals: [...originals] }
          : { status: 'refused', stage, reason: `the receipt for ${a.artifact_id} is not exactly its original, committed`, originals: [...originals] };
      }
      originals.push(a.artifact_id);
      inDoubt = undefined;
    }

    stage = 'batch';
    const answer = await request('batch', 'POST', '/v2/process/windows-frames:batch', body, { 'Idempotency-Key': key });
    const unsettled = settle(answer, 'the batch');
    if (unsettled) return unsettled;
    const ack = (answer as { body: unknown }).body;
    const mismatch = ackProblem(sent, ack, owner);
    if (mismatch) {
      return inDoubt
        ? { status: 'unknown', stage, reason: `the batch was sent without an answer, then answered with an ACK that does not answer it: ${mismatch}`, in_doubt: inDoubt, originals: [...originals] }
        : { status: 'refused', stage, reason: `the ACK does not answer the batch sent: ${mismatch}`, originals: [...originals] };
    }
    return { status: 'committed', ack: ack as Ack, originals: [...originals] };
  } catch (error) {
    if (error instanceof Stop) return error.result;
    throw error;
  }
}
