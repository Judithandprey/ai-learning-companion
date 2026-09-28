// Frozen frames for the web probe. A content script cannot legally capture the
// pixels of the page or its videos, so the only representation produced here is
// `dom_snapshot`: a hashed record of page structure and state at selection time.
// It is never labeled `screen_capture`.

import type { Frame, Identifier } from './contracts.ts';
import { isIdentifier, isUtcTimestamp } from './anchor.ts';

export type Identity = {
  readonly user_id: Identifier;
  readonly session_id: Identifier;
  readonly device_id: Identifier;
  /** Where the identity came from. Page content can never supply it. */
  readonly origin: 'synthetic_probe' | 'native_bridge';
};

export type SourceBinding = {
  readonly source_id: Identifier;
  readonly source_version: number;
  readonly source_timezone: string;
};

export type MediaState = {
  /** Null when the element has no loaded media, so the position is unknown. */
  readonly current_time: number | null;
  readonly paused: boolean;
  readonly active_cues: ReadonlyArray<string>;
  readonly cue_access: 'readable' | 'none' | 'blocked';
};

export type DomSnapshotPayload = {
  readonly kind: 'dom_snapshot/v1';
  /** UTC time the page state was read, taken synchronously with the snapshot (never after hashing). */
  readonly captured_at: string;
  /** Origin and path only: query, fragment and URL credentials are dropped. */
  readonly page: { readonly origin: string; readonly path: string; readonly query_omitted: boolean };
  /** Page-declared version marker (probe fixture only); real pages resolve versions by registration. */
  readonly document_version: string | null;
  readonly viewport: { readonly width: number; readonly height: number; readonly device_pixel_ratio: number };
  readonly scroll: { readonly x: number; readonly y: number };
  readonly selection: { readonly text: string; readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } };
  readonly context_text: string;
  readonly media: MediaState | null;
  readonly pixels: 'not_captured';
};

export type Ids = { next(prefix: string): Identifier };
export type Clock = () => string;

export const randomIds: Ids = {
  next(prefix) {
    return `${prefix}_${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
  },
};

export const systemClock: Clock = () => new Date().toISOString();

/** Deterministic JSON with sorted object keys, used for hashing. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('non-finite number in snapshot');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Strips credentials, query and fragment from a page URL for the snapshot. */
export function snapshotLocation(href: string): DomSnapshotPayload['page'] {
  const url = new URL(href);
  return Object.freeze({ origin: url.origin, path: url.pathname, query_omitted: url.search.length > 0 });
}

export type FrozenFrame = {
  readonly frame: Frame;
  /** Exact bytes whose SHA-256 is `frame.content_hash`, kept for later upload. */
  readonly artifactBytes: string;
};

export async function freezeDomSnapshot(
  payload: DomSnapshotPayload,
  identity: Identity,
  source: SourceBinding,
  ids: Ids,
): Promise<FrozenFrame> {
  // Everything that describes the source moment comes from the snapshot itself;
  // the asynchronous hash below cannot shift the capture time.
  if (!isUtcTimestamp(payload.captured_at)) throw new Error('invalid frame: snapshot captured_at must be UTC');
  const artifactBytes = canonicalJson(payload);
  const contentHash = await sha256Hex(artifactBytes);
  const media = payload.media;
  const frame: Frame = Object.freeze({
    user_id: identity.user_id,
    source_id: source.source_id,
    source_version: source.source_version,
    frame_id: ids.next('frm'),
    session_id: identity.session_id,
    device_id: identity.device_id,
    captured_at: payload.captured_at,
    source_timezone: source.source_timezone,
    media_position: media && typeof media.current_time === 'number' && Number.isFinite(media.current_time) && media.current_time >= 0 ? media.current_time : null,
    width: Math.max(1, Math.round(payload.viewport.width)),
    height: Math.max(1, Math.round(payload.viewport.height)),
    artifact_id: ids.next('art'),
    content_hash: contentHash,
    representation: 'dom_snapshot',
  });
  const problems = frameProblems(frame);
  if (problems.length > 0) throw new Error(`invalid frame: ${problems.join('; ')}`);
  return Object.freeze({ frame, artifactBytes });
}

export function frameProblems(frame: Frame): string[] {
  const problems: string[] = [];
  for (const key of ['user_id', 'source_id', 'frame_id', 'session_id', 'device_id', 'artifact_id'] as const) {
    if (!isIdentifier(frame[key])) problems.push(`${key} is not an Identifier`);
  }
  if (!Number.isSafeInteger(frame.source_version) || frame.source_version < 1) problems.push('source_version must be a positive safe integer');
  if (!isUtcTimestamp(frame.captured_at)) problems.push('captured_at must be UTC');
  if (!/^[a-f0-9]{64}$/.test(frame.content_hash)) problems.push('content_hash must be SHA-256 hex');
  if (!Number.isSafeInteger(frame.width) || frame.width < 1 || !Number.isSafeInteger(frame.height) || frame.height < 1) problems.push('frame size must be positive integers');
  return problems;
}
