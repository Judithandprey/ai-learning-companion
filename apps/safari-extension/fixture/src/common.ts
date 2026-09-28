// Fixture-only bootstrap shared by the owned probe pages. Not extension code.

import { ProbeSession } from '../../src/session.ts';
import { installProbe, type CardSnapshot, type ProbeEvent } from '../../src/page.ts';
import { unavailableTransport } from '../../src/bridge.ts';
import { randomIds, systemClock } from '../../src/frame.ts';
import { FIXTURE_EXPLANATIONS, FIXTURE_ORIGINS, SYNTHETIC_IDENTITY, resolveFixtureSource } from '../../src/fixture-data.ts';

export type ProbeHandle = {
  readonly session: ProbeSession;
  readonly events: ProbeEvent[];
  readonly host: HTMLElement;
  readonly toolbarRects: () => Record<string, { x: number; y: number; width: number; height: number }>;
  readonly cardSnapshot: () => CardSnapshot;
};

/** Viewport geometry of an element or of a phrase inside it (fixture test helper). */
export function pointOf(doc: Document, selector: string, phrase?: string): { x: number; y: number; left: number; right: number; top: number; bottom: number } | null {
  const elem = doc.querySelector(selector);
  if (!elem) return null;
  let r: DOMRect = elem.getBoundingClientRect();
  if (phrase) {
    const walker = doc.createTreeWalker(elem, NodeFilter.SHOW_TEXT);
    let found = false;
    for (let n = walker.nextNode(); n && !found; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf(phrase);
      if (i >= 0) {
        const range = doc.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + phrase.length);
        r = range.getBoundingClientRect();
        found = true;
      }
    }
    if (!found) return null;
  }
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}

declare global {
  interface Window {
    __lcProbe?: ProbeHandle & Record<string, unknown>;
  }
}

export function versionMeta(doc: Document): HTMLMetaElement {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="lc-fixture-source-version"]');
  if (!meta) throw new Error('fixture page lacks its version marker');
  return meta;
}

/** `acceptSyntheticEvents` is only for the in-page self-test (`?selftest=1`). */
export function boot(role: 'top' | 'frame', acceptSyntheticEvents = false): ProbeHandle {
  const meta = versionMeta(document);
  const session = new ProbeSession({
    identity: SYNTHETIC_IDENTITY,
    ids: randomIds,
    clock: systemClock,
    transport: unavailableTransport,
    fixtures: FIXTURE_EXPLANATIONS,
    resolveSource: resolveFixtureSource,
    projectId: null,
    knowledgeProfileVersion: 1,
  });
  const events: ProbeEvent[] = [];
  const { host, toolbarRects, cardSnapshot } = installProbe({
    win: window,
    session,
    documentVersion: () => meta.getAttribute('content'),
    role,
    peerOrigins: FIXTURE_ORIGINS,
    onEvent: (e) => events.push(e),
    acceptSyntheticEvents,
  });
  return { session, events, host, toolbarRects, cardSnapshot };
}

export function otherFixtureOrigin(): string {
  return location.origin === 'http://localhost:4173' ? 'http://127.0.0.1:4173' : 'http://localhost:4173';
}
