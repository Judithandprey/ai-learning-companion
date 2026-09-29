// Project-authored synthetic data for the owned probe page only. It is test
// data, never user history, and is recognized only on the probe page itself.

import type { FixtureExplanation } from './explain.ts';
import type { DomSnapshotPayload, Identity, SourceBinding } from './frame.ts';

export const FIXTURE_SOURCE_ID = 'web-probe-fixture';
export const FIXTURE_FRAME_SOURCE_ID = 'web-probe-fixture-frame';
/** Owned probe pages and the synthetic source each one stands for. */
export const FIXTURE_PAGES: Readonly<Record<string, string>> = Object.freeze({
  '/fixture/index.html': FIXTURE_SOURCE_ID,
  '/fixture/frame.html': FIXTURE_FRAME_SOURCE_ID,
});
/**
 * The port the fixture pages are served on: the page's own (the check server can move off the
 * lead-allocated 4173 when it is taken), 4173 where there is no page (unit tests).
 */
const FIXTURE_PORT = (globalThis as { location?: { port?: string } }).location?.port || '4173';
export const FIXTURE_ORIGINS: ReadonlyArray<string> = Object.freeze([`http://localhost:${FIXTURE_PORT}`, `http://127.0.0.1:${FIXTURE_PORT}`]);

/** Synthetic identity used only while no native bridge supplies a real one. */
export const SYNTHETIC_IDENTITY: Identity = Object.freeze({
  user_id: 'synthetic-web-probe-user',
  session_id: 'synthetic-web-probe-session',
  device_id: 'synthetic-web-probe-device',
  origin: 'synthetic_probe',
});

export const FIXTURE_EXPLANATIONS: ReadonlyArray<FixtureExplanation> = Object.freeze([
  Object.freeze({
    source_id: FIXTURE_SOURCE_ID,
    source_version: 1,
    selected_text: 'change of basis',
    text:
      'Synthetic fixture: a change of basis re-expresses the same vector in new coordinates; the vector itself does not move. (换基：坐标变，向量本身不变。)',
    source_event_ids: Object.freeze([]),
  }),
  Object.freeze({
    source_id: FIXTURE_SOURCE_ID,
    source_version: 1,
    selected_text: 'eigenvector',
    text:
      'Synthetic fixture: a nonzero eigenvector v satisfies Av = λv, so the map only scales it by λ. A negative λ reverses its direction; λ = 0 sends it to the zero vector. (特征向量：Av = λv，只被 λ 缩放；λ < 0 时反向，λ = 0 时变为零向量。)',
    source_event_ids: Object.freeze([]),
  }),
  Object.freeze({
    source_id: FIXTURE_FRAME_SOURCE_ID,
    source_version: 1,
    selected_text: 'orthogonal projection',
    text: 'Synthetic fixture: an orthogonal projection drops the component perpendicular to the subspace, leaving the closest point in it. (正交投影：去掉垂直分量，得到子空间中最近的点。)',
    source_event_ids: Object.freeze([]),
  }),
]);

/** Resolves only the owned fixture pages; any other page is unregistered. */
export function resolveFixtureSource(snapshot: DomSnapshotPayload): SourceBinding | null {
  const { page, document_version: documentVersion } = snapshot;
  const sourceId = Object.hasOwn(FIXTURE_PAGES, page.path) ? FIXTURE_PAGES[page.path] : undefined;
  if (!FIXTURE_ORIGINS.includes(page.origin) || sourceId === undefined) return null;
  if (documentVersion === null || !/^[1-9][0-9]{0,8}$/.test(documentVersion)) return null;
  const version = Number(documentVersion);
  if (!Number.isSafeInteger(version) || version < 1) return null;
  return Object.freeze({ source_id: sourceId, source_version: version, source_timezone: 'America/Los_Angeles' });
}
