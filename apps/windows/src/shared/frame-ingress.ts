// Retained whole-display frames as released WindowsFrame 0.2.9 values in one ordered WindowsFrameBatchRequest
// 0.2.10 (packages/contracts/windows_frame and windows_capture_ingress at 6305389). DOM-free and pure: it reads
// the retention manifest's text (lc-desktop-capture-retention/v1) and a plan in which the trusted caller supplies
// every identity: batch, Idempotency-Key, device/session/stream, source, record IDs and Process sequences, frame
// IDs and the OriginalArtifactBinding of each original. It returns the exact request bytes, or refuses; nothing
// retained is read or changed, and nothing is sent. Native labels and file names never become identities.
//
// - A retained sample becomes one framed record with its raw PNG and composed PNG kept apart, as retained (an
//   identical file may be one shared original or two). A separate editable-ink original can be carried with it:
//   the composed image is a rendered derivative, never the editable ink.
// - A known gap, a run of samples not retained, a refusal, frames lost at a forced end and unwritten lines become
//   frameless coverage records (no image, no invented operation or clock); what coverage cannot carry (durations,
//   ranges, reasons) is listed as unrepresented. The end of a session is not a record; after it, nothing is live.
// - Facts are carried as retained: no rounding, reordering, filling or inference. Records follow the manifest's order,
//   each line once. A value the contract cannot carry (an original over 32 MiB, a body over 4 MiB, a malformed fact)
//   is refused visibly; nothing is resized or dropped. A torn last line (a crash) is unknown coverage, not an error.

export const FRAME_VERSION = '0.2.9';
export const REQUEST_VERSION = '0.2.10';
export const PROCESS_VERSION = '0.2.0';
/** The released PNG original reference ceiling (32 MiB); main retains PNGs up to 96 MiB. */
export const MAX_ORIGINAL_BYTES = 33_554_432;
/** The released request body ceiling (4 MiB). */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_RECORDS = 100;

export type SourceRef = { readonly user_id: string; readonly source_id: string; readonly source_version: number };
export type ArtifactReference = { readonly artifact_id: string; readonly sha256: string; readonly byte_length: number; readonly media_type: string };
export type OriginalArtifactBinding = { readonly contract_version: '0.2.2'; readonly source: SourceRef; readonly artifact: ArtifactReference; readonly kind: 'screen_image' | 'editable_ink' };

type Png = { artifact: ArtifactReference; width: number; height: number; pixels_sha256: string; native_file: string };
type Marks = { verified: number; changed: number; unknown: number; following_content: number };
export type WindowsFrame = {
  contract_version: '0.2.9';
  kind: 'retained_capture_frame';
  frame_id: string;
  device_id: string;
  session_id: string;
  stream_id: string;
  source: SourceRef;
  captured_at: null;
  media_position: null;
  capture_latency_ms: null;
  raw: Png;
  composed: { image: Png; ink_session: string; ink_revision: number; visible_strokes: number; ink_marks: Marks; transformation: string } | null;
  profile: {
    kind: 'windows_electron';
    retention_format: 'lc-desktop-capture-retention/v1';
    capture_session: string;
    started_at: string;
    source_at_start: { kind: 'display'; source_id: string; display_id: string; label: string; bounds: { x: number; y: number; width: number; height: number }; scale_factor: number };
    sample: {
      sample_seq: number;
      frame_seq: number;
      reason: string;
      deferred_samples_not_retained: number[];
      sampled_at: string;
      taken_at: string;
      monotonic_ms: number;
      state: string;
      gap_ms: number | null;
      presented_frames: number;
      stream_presented_frames: number;
      presentation_ms: number | null;
      frame_age_ms: number | null;
      change_from_previous_sample: number | null;
    };
  };
};
type Coverage = 'observed_samples' | 'partial' | 'unobserved' | 'unknown';
export type ProcessRecord = {
  record_id: string;
  sequence: number;
  source: SourceRef;
  scope: { kind: 'provisional_session' };
  observed_at: null;
  clock: null;
  media_position: null;
  surface: 'original_screen_overlay';
  method: 'visual';
  causal_parents: string[];
  artifacts: ArtifactReference[];
  evidence: { kind: 'coverage'; coverage: Coverage; from_clock_ms: null; through_clock_ms: null; missing_sequences: never[]; limitations: string[] };
  frame_id: string | null;
};
export type WindowsFrameBatchRequest = {
  contract_version: '0.2.10';
  batch: { contract_version: '0.2.0'; batch_id: string; device_id: string; session_id: string; stream_id: string; delivery_mode: 'live' | 'historical'; records: ProcessRecord[] };
  frames: WindowsFrame[];
};

/** One record to prepare, with its identity as the trusted caller assigns it (the sequence is the Process stream's, never a sample ordinal). */
export type PlanEntry =
  | {
      readonly kind: 'frame';
      /** The retained sample, by its sample_seq in the manifest. */
      readonly sample_seq: number;
      readonly frame_id: string;
      /** The original of the raw PNG, and of the composed PNG (null exactly when none was retained). */
      readonly raw: OriginalArtifactBinding;
      readonly composed: OriginalArtifactBinding | null;
      /** The separate editable-ink original of this moment, when the caller has one to carry with the frame. */
      readonly ink: OriginalArtifactBinding | null;
      readonly record_id: string;
      readonly sequence: number;
    }
  | {
      readonly kind: 'coverage';
      /** The manifest line (1-based) of a gap, not_retained, refused, unfinished or unwritten event. */
      readonly line: number;
      readonly record_id: string;
      readonly sequence: number;
    };
export type IngressPlan = {
  readonly batch_id: string;
  readonly idempotency_key: string;
  readonly delivery_mode: 'live' | 'historical';
  readonly device_id: string;
  readonly session_id: string;
  readonly stream_id: string;
  /** The registered shared-display source of every record. */
  readonly source: SourceRef;
  /** The retention (capture) session the caller registered that source for; the manifest must be that session's. */
  readonly capture_session: string;
  readonly entries: ReadonlyArray<PlanEntry>;
};
/** A prepared, unsent request: these exact bytes are kept for retries under the same Idempotency-Key. */
export type IngressRequest = {
  readonly idempotency_key: string;
  readonly body: string;
  readonly request: WindowsFrameBatchRequest;
  /** Retained facts the request cannot carry; they stay in the retention manifest. */
  readonly unrepresented: string[];
};

/** Why a request cannot be prepared. Nothing retained is changed. */
export class MappingRefusal extends Error {}

export type ManifestLine = { readonly line: number; readonly kind: string; readonly value: Record<string, unknown> };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const isHex64 = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
/** A local wall time as the producer writes it (YYYY-MM-DDTHH:MM:SS[.fff]Z), and a real instant: no 30 February, hour 24 or year 0. */
const isWall = (v: unknown): v is string => {
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(v) : null;
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return y >= 1 && t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && t.getUTCHours() === h && t.getUTCMinutes() === mi && t.getUTCSeconds() === s;
};
/** A finite number within the contracts' safe bounds. */
const isBounded = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER;
/** Whether any text in a value holds a lone UTF-16 surrogate, which cannot be sent as UTF-8 (JSON.stringify would escape it, and the receiver would read it back as a lone surrogate). */
const hasLoneSurrogate = (v: unknown): boolean =>
  typeof v === 'string' ? /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v) : typeof v === 'object' && v !== null ? Object.values(v).some(hasLoneSurrogate) : false;
const isLabel = (v: unknown, min = 1): v is string => typeof v === 'string' && v.length >= min && v.length <= 1024;
const isIdentifier = (v: unknown): v is string => typeof v === 'string' && v.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(v);
const refuse = (why: string): never => {
  throw new MappingRefusal(why);
};

/**
 * The manifest's lines, read strictly: every line whole JSON, the header first. Only a last line without its line
 * end may be torn (an append cut short by a crash, which main cuts back only at its next append): it is kept as kind
 * 'torn', whose content is unknown. Any other damage refuses the manifest as a whole.
 */
export function readManifest(text: string): ManifestLine[] {
  const lines = text.split('\n');
  const complete = lines.at(-1) === '';
  if (complete) lines.pop();
  const out = lines.map((raw, i): ManifestLine => {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      if (i === lines.length - 1 && !complete && i > 0) return { line: i + 1, kind: 'torn', value: {} };
      return refuse(`manifest line ${i + 1} is not whole JSON (a damaged line); nothing is mapped from this manifest`);
    }
    if (!isObj(value) || typeof value['kind'] !== 'string') refuse(`manifest line ${i + 1} has no kind`);
    return { line: i + 1, kind: (value as { kind: string }).kind, value: value as Record<string, unknown> };
  });
  if (out[0]?.kind !== 'header' || out[0].value['format'] !== 'lc-desktop-capture-retention/v1') refuse('the manifest does not begin with an lc-desktop-capture-retention/v1 header');
  if (out.slice(1).some((l) => l.kind === 'header')) refuse('the manifest has more than one header');
  return out;
}

/** The existing coverage vocabulary for a retained event without an image (engineering defaults, as for macOS). */
export function coverageOf(line: ManifestLine): { coverage: Coverage; limitations: string[]; note: string } {
  const v = line.value;
  const at = `manifest line ${line.line}`;
  switch (line.kind) {
    case 'gap':
      // The sampler ran late: nothing is known about the display then.
      if (!isInt(v['sample_seq'], 1) || !isInt(v['gap_ms'], 1)) refuse(`${at}: the gap is malformed`);
      return { coverage: 'unknown', limitations: ['unknown'], note: `${at}: the sampler ran ${v['gap_ms']} ms late before sample ${v['sample_seq']} (sampled at ${String(v['sampled_at'])}, monotonic ${String(v['monotonic_ms'])} ms); nothing is known about the display then. The duration stays in the manifest` };
    case 'not_retained':
      // Pixels observed, not kept.
      if (!isInt(v['from_seq'], 1) || !isInt(v['to_seq'], 1) || !isInt(v['samples'], 1)) refuse(`${at}: the not-retained run is malformed`);
      return { coverage: 'partial', limitations: ['sample_only'], note: `${at}: samples ${v['from_seq']}–${v['to_seq']} (${v['samples']}) were observed and not retained: ${String(v['reason'])}` };
    case 'refused':
      if (!isInt(v['sample_seq'], 1)) refuse(`${at}: the refusal is malformed`);
      return { coverage: 'partial', limitations: ['sample_only'], note: `${at}: the frame of sample ${v['sample_seq']} (standing for deferred samples ${JSON.stringify(v['deferred_samples_not_retained'] ?? [])}) was not retained: ${String(v['reason'])}` };
    case 'unfinished': {
      const lost = Array.isArray(v['samples']) ? (v['samples'] as unknown[]) : null;
      if (!lost || !lost.every((s) => isInt(s, 1))) refuse(`${at}: the unfinished record is malformed`);
      const deferred = JSON.stringify(v['deferred_samples_not_retained'] ?? []);
      return lost!.length > 0
        ? { coverage: 'partial', limitations: ['sample_only'], note: `${at}: the frames of samples ${JSON.stringify(lost)} (standing for deferred samples ${deferred}) were being written when the overlay was ended; their pixels are lost` }
        : { coverage: 'unknown', limitations: ['unknown'], note: `${at}: the overlay was ended before confirming its retained frames; frames after the last listed one may be missing` };
    }
    case 'unwritten':
      if (!isInt(v['count'], 1)) refuse(`${at}: the unwritten count is malformed`);
      return { coverage: 'unknown', limitations: ['missing_events'], note: `${at}: ${v['count']} earlier manifest line(s) could not be written; their events are not known` };
    case 'torn':
      return { coverage: 'unknown', limitations: ['missing_events'], note: `${at}: the last line was cut short (an append interrupted, for example by a crash); what it recorded is not known` };
    default:
      return refuse(`${at} (${line.kind}) is not an event without an image: ${line.kind === 'retained' ? 'a retained sample is mapped as a frame' : line.kind === 'ended' ? 'the end of a session is not a Process record' : 'it has no coverage meaning'}`);
  }
}

function binding(b: OriginalArtifactBinding, kind: 'screen_image' | 'editable_ink', source: SourceRef, what: string): ArtifactReference {
  if (!isObj(b) || b.contract_version !== '0.2.2' || b.kind !== kind) refuse(`${what}: a ${kind} OriginalArtifactBinding 0.2.2 is required`);
  if (!isObj(b.source) || b.source.user_id !== source.user_id || b.source.source_id !== source.source_id || b.source.source_version !== source.source_version) refuse(`${what}: the original belongs to another source`);
  const a = b.artifact;
  if (!isObj(a) || !isIdentifier(a.artifact_id) || !isHex64(a.sha256) || !isInt(a.byte_length, 1)) refuse(`${what}: the artifact reference is malformed`);
  if (a.byte_length > MAX_ORIGINAL_BYTES) refuse(`${what}: the original is ${a.byte_length} bytes, over the ${MAX_ORIGINAL_BYTES}-byte original limit; it stays on this device, whole, and is not sent`);
  if (kind === 'screen_image' && a.media_type !== 'image/png') refuse(`${what}: a PNG original is required`);
  if (kind === 'editable_ink' && a.media_type !== 'application/json') refuse(`${what}: the editable ink original is JSON, not ${a.media_type}`);
  return { artifact_id: a.artifact_id, sha256: a.sha256, byte_length: a.byte_length, media_type: a.media_type };
}

/** One retained image as WindowsPng, bound to its original: the binding must be of exactly this retained file. */
function png(retained: unknown, original: OriginalArtifactBinding, source: SourceRef, what: string): Png {
  if (!isObj(retained) || !isHex64(retained['sha256']) || !isInt(retained['bytes'], 1) || !isInt(retained['width'], 1) || !isInt(retained['height'], 1) || !isHex64(retained['pixels_sha256'])) refuse(`${what}: the retained file facts are malformed`);
  const r = retained as { sha256: string; bytes: number; width: number; height: number; pixels_sha256: string; file: unknown };
  if (r.file !== `frames/${r.sha256}.png`) refuse(`${what}: the retained file name does not name its SHA-256`);
  if (r.bytes > MAX_ORIGINAL_BYTES) refuse(`${what}: the retained PNG is ${r.bytes} bytes, over the ${MAX_ORIGINAL_BYTES}-byte original limit; it stays on this device, whole, and is not sent`);
  const artifact = binding(original, 'screen_image', source, what);
  if (artifact.sha256 !== r.sha256 || artifact.byte_length !== r.bytes) refuse(`${what}: the original binding is not of the retained file (SHA-256 and length must be the file's)`);
  return { artifact, width: r.width, height: r.height, pixels_sha256: r.pixels_sha256, native_file: r.file as string };
}

/** One retained sample as a WindowsFrame 0.2.9 value, with its facts exactly as retained. */
export function windowsFrame(header: ManifestLine, retained: ManifestLine, entry: Extract<PlanEntry, { kind: 'frame' }>, plan: IngressPlan): WindowsFrame {
  const h = header.value;
  const f = retained.value;
  const at = `sample ${String(f['sample_seq'])} (manifest line ${retained.line})`;
  const src = h['source'];
  if (!isObj(src) || src['kind'] !== 'display' || !isLabel(src['source_id']) || !isLabel(src['display_id']) || !isLabel(src['label'], 0) || !isObj(src['bounds']) || !(isBounded(src['scale_factor']) && src['scale_factor'] > 0)) refuse('the header source is malformed');
  const b = (src as { bounds: Record<string, unknown> }).bounds;
  if (!['x', 'y', 'width', 'height'].every((k) => isBounded(b[k])) || !((b['width'] as number) > 0 && (b['height'] as number) > 0)) refuse('the header display bounds are malformed');
  if (!isLabel(h['capture_session']) || !isWall(h['started_at'])) refuse('the header session facts are malformed');
  const seq = f['sample_seq'];
  const deferred = f['deferred_samples_not_retained'];
  if (!isInt(seq, 1) || !isInt(f['frame_seq'], 1) || (f['frame_seq'] as number) > seq) refuse(`${at}: the sample or frame ordinal is malformed`);
  if (!['first', 'ink', 'changed', 'heartbeat', 'deferred'].includes(f['reason'] as string)) refuse(`${at}: the reason is malformed`);
  if (!Array.isArray(deferred) || !deferred.every((d, i) => isInt(d, 1) && d < (seq as number) && (i === 0 || d > deferred[i - 1]))) refuse(`${at}: the deferred samples are malformed`);
  if (!isWall(f['sampled_at']) || !isWall(f['taken_at']) || !isInt(f['monotonic_ms'])) refuse(`${at}: the sample times are malformed`);
  if (!['fresh', 'no_new_frame', 'gap'].includes(f['state'] as string)) refuse(`${at}: the state is malformed`);
  // Older manifests do not carry gap_ms: unknown, never inferred.
  const gap = f['gap_ms'] === undefined ? null : f['gap_ms'];
  if (gap !== null && !(isInt(gap, 1) && f['state'] === 'gap')) refuse(`${at}: the gap duration is malformed (a whole positive number of ms, for a gap sample only)`);
  const held = f['presented_frames'];
  const stream = f['stream_presented_frames'];
  if (!isInt(held) || !isInt(stream) || held > stream) refuse(`${at}: the frame counts are malformed`);
  const known = (held as number) > 0;
  const presentation = f['presentation_ms'];
  const age = f['frame_age_ms'];
  if (known ? !isInt(presentation) || !isInt(age) || (presentation as number) > (f['monotonic_ms'] as number) : presentation !== null || age !== null) refuse(`${at}: the presentation facts are malformed`);
  const raw = f['raw'];
  if (!isObj(raw)) return refuse(`${at}: the raw image is missing`);
  const change = raw['change_from_previous_sample'];
  if (!(change === null || (typeof change === 'number' && change >= 0 && change <= 1))) refuse(`${at}: the change from the previous sample is malformed`);
  const rawPng = png(raw, entry.raw, plan.source, `${at}, raw`);
  const c = f['composed'];
  if ((c === null) !== (entry.composed === null)) refuse(`${at}: ${c === null ? 'no composed image was retained, so none can be bound' : 'the composed image needs its original binding'}`);
  let composed: WindowsFrame['composed'] = null;
  if (isObj(c) && entry.composed) {
    const image = png(c, entry.composed, plan.source, `${at}, composed`);
    const marks = c['ink_marks'];
    if (!isLabel(c['ink_session']) || !isInt(c['ink_revision']) || !isInt(c['visible_strokes']) || typeof c['transformation'] !== 'string' || c['transformation'].length < 1 || c['transformation'].length > 4096) refuse(`${at}: the composition facts are malformed`);
    if (!isObj(marks) || !['verified', 'changed', 'unknown', 'following_content'].every((k) => isInt(marks[k])) || ['verified', 'changed', 'unknown', 'following_content'].reduce((a, k) => a + (marks[k] as number), 0) !== c['visible_strokes']) refuse(`${at}: the ink marks do not account for the visible strokes`);
    if (image.width !== rawPng.width || image.height !== rawPng.height) refuse(`${at}: the composed image is not the raw image's size`);
    const m = marks as Marks;
    composed = { image, ink_session: c['ink_session'] as string, ink_revision: c['ink_revision'] as number, visible_strokes: c['visible_strokes'] as number, ink_marks: { verified: m.verified, changed: m.changed, unknown: m.unknown, following_content: m.following_content }, transformation: c['transformation'] as string };
    if (image.artifact.artifact_id === rawPng.artifact.artifact_id && JSON.stringify(image) !== JSON.stringify(rawPng)) refuse(`${at}: one artifact ID cannot name two different originals`);
  }
  const s = src as { source_id: string; display_id: string; label: string; scale_factor: number };
  return {
    contract_version: FRAME_VERSION,
    kind: 'retained_capture_frame',
    frame_id: entry.frame_id,
    device_id: plan.device_id,
    session_id: plan.session_id,
    stream_id: plan.stream_id,
    source: { ...plan.source },
    captured_at: null,
    media_position: null,
    capture_latency_ms: null,
    raw: rawPng,
    composed,
    profile: {
      kind: 'windows_electron',
      retention_format: 'lc-desktop-capture-retention/v1',
      capture_session: h['capture_session'] as string,
      started_at: h['started_at'] as string,
      source_at_start: { kind: 'display', source_id: s.source_id, display_id: s.display_id, label: s.label, bounds: { x: b['x'] as number, y: b['y'] as number, width: b['width'] as number, height: b['height'] as number }, scale_factor: s.scale_factor },
      sample: {
        sample_seq: seq as number,
        frame_seq: f['frame_seq'] as number,
        reason: f['reason'] as string,
        deferred_samples_not_retained: [...(deferred as number[])],
        sampled_at: f['sampled_at'] as string,
        taken_at: f['taken_at'] as string,
        monotonic_ms: f['monotonic_ms'] as number,
        state: f['state'] as string,
        gap_ms: gap as number | null,
        presented_frames: held as number,
        stream_presented_frames: stream as number,
        presentation_ms: presentation as number | null,
        frame_age_ms: age as number | null,
        change_from_previous_sample: change as number | null,
      },
    },
  };
}

const record = (entry: PlanEntry, plan: IngressPlan, artifacts: ArtifactReference[], coverage: Coverage, limitations: string[], frameId: string | null): ProcessRecord => ({
  record_id: entry.record_id,
  sequence: entry.sequence,
  source: { ...plan.source },
  scope: { kind: 'provisional_session' },
  observed_at: null,
  clock: null,
  media_position: null,
  surface: 'original_screen_overlay',
  method: 'visual',
  causal_parents: [],
  artifacts,
  evidence: { kind: 'coverage', coverage, from_clock_ms: null, through_clock_ms: null, missing_sequences: [], limitations },
  frame_id: frameId,
});

/** One unsent WindowsFrameBatchRequest 0.2.10 from the plan's entries, in their order. */
export function frameRequest(manifestText: string, plan: IngressPlan): IngressRequest {
  for (const [what, id] of [['batch ID', plan.batch_id], ['Idempotency-Key', plan.idempotency_key], ['device ID', plan.device_id], ['session ID', plan.session_id], ['stream ID', plan.stream_id], ['source user', plan.source?.user_id], ['source ID', plan.source?.source_id]] as const) {
    if (!isIdentifier(id)) refuse(`the ${what} is not an identifier`);
  }
  if (!isInt(plan.source.source_version, 1)) refuse('the source version is not a positive safe integer');
  if (plan.delivery_mode !== 'live' && plan.delivery_mode !== 'historical') refuse('the delivery mode is neither live nor historical');
  if (plan.entries.length < 1 || plan.entries.length > MAX_RECORDS) refuse(`a request holds 1 to ${MAX_RECORDS} records, not ${plan.entries.length}`);
  const lines = readManifest(manifestText);
  const header = lines[0]!;
  if (header.value['capture_session'] !== plan.capture_session) refuse('the manifest is not of the capture session this source was registered for');
  // The manifest shows an end by its ended line, or by an unfinished line (written only when a Stop forced the end,
  // even if the ended line after it could not be written). A Stop still waiting, or a crash, shows no end here: the
  // caller must choose historical from the moment the Stop begins.
  const ended = lines.find((l) => l.kind === 'ended');
  const endShown = ended ?? lines.find((l) => l.kind === 'unfinished');
  if (endShown && plan.delivery_mode === 'live') refuse(`the session ended (manifest line ${endShown.line}): its frames can only be sent as historical, never as live`);
  const unrepresented: string[] = [];
  if (ended) unrepresented.push(`manifest line ${ended.line}: the session ended at ${String(ended.value['at'])} (${String(ended.value['reason'])}); the end is not a Process record here`);
  const records: ProcessRecord[] = [];
  const frames: WindowsFrame[] = [];
  const frameById = new Map<string, string>();
  const artifacts = new Map<string, string>();
  const files = new Map<string, string>();
  const recordIds = new Set<string>();
  const sequences = new Set<number>();
  let lastLine = 0;
  let lastSequence = 0;
  /** Records follow the manifest: each line once, in its order, with rising Process sequences. */
  const inOrder = (line: number, entry: PlanEntry): void => {
    if (line <= lastLine || entry.sequence <= lastSequence) refuse(`record ${entry.record_id}: records must follow the manifest's order, each line once, with rising Process sequences`);
    lastLine = line;
    lastSequence = entry.sequence;
  };
  const keep = (a: ArtifactReference): ArtifactReference => {
    const known = artifacts.get(a.artifact_id);
    if (known !== undefined && known !== JSON.stringify(a)) refuse(`artifact ID ${a.artifact_id} names two different originals`);
    artifacts.set(a.artifact_id, JSON.stringify(a));
    return a;
  };
  for (const entry of plan.entries) {
    if (!isIdentifier(entry.record_id)) refuse(`the record ID ${String(entry.record_id)} is not an identifier`);
    if (!isInt(entry.sequence, 1)) refuse(`the Process sequence of record ${entry.record_id} is not a positive safe integer`);
    if (recordIds.has(entry.record_id) || sequences.has(entry.sequence)) refuse('record IDs and Process sequences must be unique in a batch');
    recordIds.add(entry.record_id);
    sequences.add(entry.sequence);
    if (entry.kind === 'coverage') {
      const line = lines.find((l) => l.line === entry.line);
      if (!line) return refuse(`the manifest has no line ${entry.line}`);
      const c = coverageOf(line);
      inOrder(line.line, entry);
      records.push(record(entry, plan, [], c.coverage, c.limitations, null));
      unrepresented.push(`record ${entry.record_id}: ${c.note}`);
      continue;
    }
    if (!isIdentifier(entry.frame_id)) refuse(`the frame ID ${String(entry.frame_id)} is not an identifier`);
    const retained = lines.filter((l) => l.kind === 'retained' && l.value['sample_seq'] === entry.sample_seq);
    if (retained.length !== 1) refuse(`the manifest ${retained.length === 0 ? 'retains no frame' : 'retains more than one frame'} for sample ${entry.sample_seq}`);
    const frame = windowsFrame(header, retained[0]!, entry, plan);
    inOrder(retained[0]!.line, entry);
    for (const p of [frame.raw, ...(frame.composed ? [frame.composed.image] : [])]) {
      // The same native PNG keeps the same facts under any archive identity.
      const facts = JSON.stringify([p.artifact.sha256, p.artifact.byte_length, p.width, p.height, p.pixels_sha256]);
      if ((files.get(p.native_file) ?? facts) !== facts) refuse(`${p.native_file} is described with different facts in this request`);
      files.set(p.native_file, facts);
    }
    const described = JSON.stringify(frame);
    const known = frameById.get(entry.frame_id);
    if (known === undefined) {
      frameById.set(entry.frame_id, described);
      frames.push(frame);
    } else if (known !== described) {
      refuse(`frame ID ${entry.frame_id} names two different frames`);
    }
    const refs = [frame.raw.artifact, ...(frame.composed && frame.composed.image.artifact.artifact_id !== frame.raw.artifact.artifact_id ? [frame.composed.image.artifact] : [])].map(keep);
    if (entry.ink) refs.push(keep(binding(entry.ink, 'editable_ink', plan.source, `sample ${entry.sample_seq}, editable ink`)));
    else if (frame.composed && frame.composed.visible_strokes > 0) unrepresented.push(`record ${entry.record_id}: the composed PNG of sample ${entry.sample_seq} is a rendered image of ink revision ${frame.composed.ink_revision}, not the editable ink; no editable-ink original is carried with it`);
    records.push(record(entry, plan, refs, 'observed_samples', ['sample_only', 'unsupported_history'], entry.frame_id));
  }
  const request: WindowsFrameBatchRequest = {
    contract_version: REQUEST_VERSION,
    batch: { contract_version: PROCESS_VERSION, batch_id: plan.batch_id, device_id: plan.device_id, session_id: plan.session_id, stream_id: plan.stream_id, delivery_mode: plan.delivery_mode, records },
    frames,
  };
  if (hasLoneSurrogate(request)) refuse('a retained text holds a lone UTF-16 surrogate, which is not UTF-8; nothing is repaired');
  const body = JSON.stringify(request);
  const bytes = new TextEncoder().encode(body).length;
  if (bytes > MAX_BODY_BYTES) refuse(`the request is ${bytes} bytes, over the ${MAX_BODY_BYTES}-byte limit; split it at record boundaries (a single record over the limit cannot be sent, and stays in the manifest)`);
  return { idempotency_key: plan.idempotency_key, body, request, unrepresented };
}
