// The next live batch of a capture session, planned from its retention manifest. Only the manifest's whole lines are
// read (the caller passes the bytes known to hold whole lines, never a torn tail), and only the lines after the last
// one already planned. Each event line becomes one record: a retained sample a frame record with its raw, composed and
// editable-ink originals; any other event (gap, not retained, refused, unwritten) a coverage record. Every identity is
// derived once from manifest facts under the registered source, so the same line always gets the same identity:
// record <source>.r<line> with Process sequence = the manifest line number, frame <source>.f<sample_seq>, originals
// <source>.png.<sha256> and <source>.ink.<sha256>, batch and Idempotency-Key <source>.b<first>-<last>.
// Pure: no I/O. Nothing is planned once the session shows its end (an ended or unfinished line).
import { frameRequest, MappingRefusal, MAX_RECORDS, readManifest, type IngressPlan, type IngressRequest, type OriginalArtifactBinding, type PlanEntry, type SourceRef } from './frame-ingress.ts';

/** The registered stream and source a session's records are sent under. */
export type StreamFacts = {
  readonly device_id: string;
  readonly session_id: string;
  readonly stream_id: string;
  readonly source: SourceRef;
  /** The retention (capture) session the source was registered for. */
  readonly capture_session: string;
};
export type Planned =
  /** A batch to send, covering manifest lines from_line..through_line. */
  | { readonly kind: 'job'; readonly plan: IngressPlan; readonly prepared: IngressRequest; readonly from_line: number; readonly through_line: number }
  /** One line that cannot be sent (it stays in the manifest, on this device). */
  | { readonly kind: 'unsendable'; readonly line: number; readonly reason: string }
  /** Nothing new to plan. */
  | { readonly kind: 'none' }
  /** The manifest shows the session's end: nothing more is planned live. */
  | { readonly kind: 'ended'; readonly line: number };

/** The longest source ID for which every derived identity is a released Identifier (at most 128 characters). */
export const MAX_SOURCE_ID = 128 - '.png.'.length - 64;

export const identities = (sourceId: string) => ({
  record: (line: number): string => `${sourceId}.r${line}`,
  frame: (sampleSeq: number): string => `${sourceId}.f${sampleSeq}`,
  png: (sha: string): string => `${sourceId}.png.${sha}`,
  ink: (sha: string): string => `${sourceId}.ink.${sha}`,
  batch: (from: number, through: number): string => `${sourceId}.b${from}-${through}`,
});

/**
 * The next batch after `plannedThrough` (a manifest line number; 0 before any), from `text`: the manifest's first bytes
 * known to hold whole lines. At most `maxRecords` records; a batch the mapper refuses (over its size limit, or a line
 * it cannot map) is split, down to one line, which is then unsendable.
 */
export function planNext(text: string, facts: StreamFacts, plannedThrough: number, maxRecords = MAX_RECORDS): Planned {
  const lines = readManifest(text);
  const header = lines[0];
  if (!header || header.kind !== 'header') return { kind: 'none' };
  if (header.value['capture_session'] !== facts.capture_session) throw new Error('the manifest is not of the capture session this source was registered for');
  const end = lines.find((l) => l.kind === 'ended' || l.kind === 'unfinished');
  const next = lines.filter((l) => l.line > plannedThrough && l.kind !== 'header' && l.kind !== 'ended' && !l.torn && (!end || l.line < end.line));
  if (next.length === 0) return end ? { kind: 'ended', line: end.line } : { kind: 'none' };
  if (end) return { kind: 'ended', line: end.line }; // frames before the end are not sent live after it
  const id = identities(facts.source.source_id);
  const binding = (kind: 'screen_image' | 'editable_ink', sha: string, bytes: number): OriginalArtifactBinding => ({
    contract_version: '0.2.2',
    source: facts.source,
    artifact: { artifact_id: kind === 'screen_image' ? id.png(sha) : id.ink(sha), sha256: sha, byte_length: bytes, media_type: kind === 'screen_image' ? 'image/png' : 'application/json' },
    kind,
  });
  const entries: PlanEntry[] = next.map((l) => {
    if (l.kind !== 'retained') return { kind: 'coverage', line: l.line, record_id: id.record(l.line), sequence: l.line };
    const raw = l.value['raw'] as { sha256: string; bytes: number };
    const composed = l.value['composed'] as { sha256: string; bytes: number; ink_original?: { sha256?: string; bytes?: number } | null } | null;
    const ink = composed?.ink_original;
    const seq = l.value['sample_seq'] as number;
    return {
      kind: 'frame',
      sample_seq: seq,
      frame_id: id.frame(seq),
      raw: binding('screen_image', raw.sha256, raw.bytes),
      composed: composed ? binding('screen_image', composed.sha256, composed.bytes) : null,
      ink: ink && typeof ink.sha256 === 'string' && typeof ink.bytes === 'number' ? binding('editable_ink', ink.sha256, ink.bytes) : null,
      record_id: id.record(l.line),
      sequence: l.line,
    };
  });
  const lineOf = (e: PlanEntry): number => e.sequence;
  let take = Math.min(entries.length, Math.max(1, maxRecords));
  for (;;) {
    const chosen = entries.slice(0, take);
    const from = lineOf(chosen[0]!);
    const through = lineOf(chosen[chosen.length - 1]!);
    const plan: IngressPlan = { batch_id: id.batch(from, through), idempotency_key: id.batch(from, through), delivery_mode: 'live', device_id: facts.device_id, session_id: facts.session_id, stream_id: facts.stream_id, source: facts.source, capture_session: facts.capture_session, entries: chosen };
    try {
      return { kind: 'job', plan, prepared: frameRequest(text, plan), from_line: from, through_line: through };
    } catch (error) {
      if (!(error instanceof MappingRefusal)) throw error;
      if (take === 1) return { kind: 'unsendable', line: from, reason: error.message };
      take = Math.ceil(take / 2);
    }
  }
}
