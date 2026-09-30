// The WindowsFrame ingress fixtures: actual retention records mapped by frame-ingress.ts into exact
// WindowsFrameBatchRequest 0.2.10 bodies. Every identity (batch, device/session/stream, source, records, frames,
// archive artifact IDs, the editable-ink original) is synthetic, as a trusted caller would supply it; every
// retained fact comes from the manifests unchanged.
//
//   node scripts/ingress-fixtures.ts --write   (writes docs/verification/web/evidence/windows-frame-ingress/)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { frameRequest, readManifest, type IngressPlan, type OriginalArtifactBinding, type PlanEntry } from '../src/shared/frame-ingress.ts';

export const EVIDENCE = fileURLToPath(new URL('../../../docs/verification/web/evidence/', import.meta.url));
export const OUT = `${EVIDENCE}windows-frame-ingress/`;

const SOURCE = { user_id: 'example-user', source_id: 'example-display-source', source_version: 1 };
const INCARNATION = { device_id: 'example-windows-device', session_id: 'example-learning-session', stream_id: 'example-capture-stream' };
/** The stored DisplaySourceSnapshot 0.2.3 the service would hold for that source (synthetic). */
export const DISPLAY_SOURCE = { contract_version: '0.2.3', ...SOURCE, type: 'shared_display', ...INCARNATION, project_id: null, created_at: '2026-09-30T00:00:00Z', source_timezone: 'UTC' };
const screen = (id: string, sha256: string, bytes: number): OriginalArtifactBinding => ({ contract_version: '0.2.2', source: SOURCE, artifact: { artifact_id: id, sha256, byte_length: bytes, media_type: 'image/png' }, kind: 'screen_image' });

type Options = { name: string; manifest: string; note: string; batch: string; distinctIdsFor?: number; inkFor?: number };
/** A plan with one record per retained sample and per event without an image, in manifest order. */
function planFor(o: Options, text: string): IngressPlan {
  const lines = readManifest(text);
  const entries: PlanEntry[] = [];
  for (const l of lines) {
    if (l.kind === 'header' || l.kind === 'ended') continue;
    const sequence = entries.length + 1;
    const record_id = `${o.batch}-record-${sequence}`;
    if (l.kind !== 'retained') {
      entries.push({ kind: 'coverage', line: l.line, record_id, sequence });
      continue;
    }
    const seq = l.value['sample_seq'] as number;
    const raw = l.value['raw'] as { sha256: string; bytes: number };
    const composed = l.value['composed'] as { sha256: string; bytes: number } | null;
    const rawBinding = screen(`example-png-${raw.sha256.slice(0, 16)}`, raw.sha256, raw.bytes);
    // Where raw and composed are the same file, one shared original, or (for one sample) two archive identities.
    const composedBinding = !composed ? null : composed.sha256 === raw.sha256 && seq !== o.distinctIdsFor ? rawBinding : screen(`example-png-${composed.sha256.slice(0, 16)}${composed.sha256 === raw.sha256 ? '-composed' : ''}`, composed.sha256, composed.bytes);
    const ink: OriginalArtifactBinding | null =
      seq === o.inkFor ? { contract_version: '0.2.2', source: SOURCE, artifact: { artifact_id: `example-ink-${o.batch}`, sha256: createHash('sha256').update(`synthetic editable ink for ${o.batch}`).digest('hex'), byte_length: 4096, media_type: 'application/json' }, kind: 'editable_ink' } : null;
    entries.push({ kind: 'frame', sample_seq: seq, frame_id: `${o.batch}-frame-${seq}`, raw: rawBinding, composed: composedBinding, ink, record_id, sequence });
  }
  const ended = lines.some((l) => l.kind === 'ended');
  return { batch_id: o.batch, idempotency_key: `${o.batch}-key`, delivery_mode: ended ? 'historical' : 'live', ...INCARNATION, source: SOURCE, capture_session: lines[0]!.value['capture_session'] as string, entries };
}

export const CASES: Options[] = [
  {
    name: 'native',
    manifest: 'windows-frame-ingress/native-capture/manifest.jsonl',
    note: 'The native retention sample of the author self-test run 13:56:37–13:57:58 UTC, copied here so later self-test runs do not change it (whole display, test content only). Two retained samples have the same file as raw and composed: one shared original (sample 1) and two archive identities (sample 3). Sample 10 carries a synthetic editable-ink original beside its rendered composition.',
    batch: 'example-native',
    distinctIdsFor: 3,
    inkFor: 10,
  },
  {
    name: 'harness',
    manifest: 'windows-frame-ingress/harness-capture/manifest.jsonl',
    note: 'A retention record made by the real main.ts and overlay.ts under the unit-test fakes (scripts/ingress-harness-capture.ts; not a native capture): two known gaps (one with the same pixels, one retained), a torn line counted as unwritten (its frame file stays on disk without a line), a frame lost at the Stop bound, and the end.',
    batch: 'example-harness',
  },
];

export function build(o: Options): { meta: Record<string, unknown>; body: string } {
  const text = readFileSync(`${EVIDENCE}${o.manifest}`, 'utf8').replace(/\r\n/g, '\n'); // as committed, on any checkout
  const plan = planFor(o, text);
  const prepared = frameRequest(text, plan);
  const meta = {
    note: `${o.note} Every identity here is synthetic, as a trusted caller would supply it; the retained facts are the manifest's, unchanged.`,
    manifest: o.manifest,
    manifest_sha256: createHash('sha256').update(text).digest('hex'),
    body: `${o.name}.body.json`,
    body_sha256: createHash('sha256').update(prepared.body).digest('hex'),
    display_source: DISPLAY_SOURCE,
    plan,
    unrepresented: prepared.unrepresented,
  };
  return { meta, body: prepared.body };
}

if (process.argv[2] === '--write') {
  mkdirSync(OUT, { recursive: true });
  for (const o of CASES) {
    const { meta, body } = build(o);
    writeFileSync(`${OUT}${o.name}.json`, `${JSON.stringify(meta, null, 2)}\n`);
    writeFileSync(`${OUT}${o.name}.body.json`, body);
    console.log(`${o.name}: ${(meta.plan as IngressPlan).entries.length} records, body ${body.length} bytes`);
  }
}
