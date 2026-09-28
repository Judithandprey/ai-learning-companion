import type { DomSnapshotPayload, Ids, MediaState } from '../src/frame.ts';

export function counterIds(): Ids {
  let n = 0;
  return { next: (prefix) => `${prefix}_${String(++n).padStart(4, '0')}` };
}

export function fixedClock(start = Date.UTC(2026, 8, 28, 12, 0, 0)): () => string {
  let t = start;
  return () => new Date((t += 1000)).toISOString();
}

export function snapshot(overrides: {
  text?: string;
  rect?: { x: number; y: number; width: number; height: number };
  version?: string | null;
  origin?: string;
  path?: string;
  scroll?: { x: number; y: number };
  media?: MediaState | null;
} = {}): DomSnapshotPayload {
  return {
    kind: 'dom_snapshot/v1',
    captured_at: '2026-09-28T12:00:00.000Z',
    page: { origin: overrides.origin ?? 'http://localhost:4173', path: overrides.path ?? '/fixture/index.html', query_omitted: false },
    document_version: overrides.version === undefined ? '1' : overrides.version,
    viewport: { width: 1000, height: 800, device_pixel_ratio: 2 },
    scroll: overrides.scroll ?? { x: 0, y: 0 },
    selection: { text: overrides.text ?? 'change of basis', rect: overrides.rect ?? { x: 100, y: 200, width: 300, height: 40 } },
    context_text: 'A change of basis changes coordinates, not the underlying vector.',
    media: overrides.media === undefined ? null : overrides.media,
    pixels: 'not_captured',
  };
}
