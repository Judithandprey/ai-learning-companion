// Fixture-only bootstrap shared by the owned probe pages. Not extension code.

import { ProbeSession } from '../../src/session.ts';
import { installProbe, type CardSnapshot, type ProbeEvent } from '../../src/page.ts';
import { unavailableTransport, type NativeTransport } from '../../src/bridge.ts';
import type { BridgeRequest } from '../../src/contracts.ts';
import { randomIds, systemClock } from '../../src/frame.ts';
import { FIXTURE_EXPLANATIONS, FIXTURE_ORIGINS, SYNTHETIC_IDENTITY, resolveFixtureSource } from '../../src/fixture-data.ts';

export type ProbeHandle = {
  readonly session: ProbeSession;
  readonly events: ProbeEvent[];
  readonly host: HTMLElement;
  readonly toolbarRects: () => Record<string, { x: number; y: number; width: number; height: number }>;
  readonly cardSnapshot: () => CardSnapshot;
  readonly confirmAdjust: () => void;
  readonly closeCard: () => void;
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

/**
 * Self-test-only transport. By default it fails like a missing native bridge (the
 * outcome is the same local bridge_unavailable). With `hold` on, requests wait
 * until the test resolves them, so out-of-order bridge answers can be exercised.
 * It is not a native bridge and proves nothing about one.
 */
export type DeferredBridge = {
  transport: NativeTransport;
  hold: (on: boolean) => void;
  pending: () => number;
  /** Answers the i-th held request (in send order, over the whole run) with an ACK for its request id. */
  ack: (i: number) => void;
  /** Answers the most recently held request. */
  ackLatest: () => void;
  /** Number of requests held so far (the index the next held request will get). */
  sent: () => number;
};

export function deferredBridge(): DeferredBridge {
  let holding = false;
  const held: Array<{ request: BridgeRequest; resolve: (v: unknown) => void; done: boolean }> = [];
  return {
    transport: {
      kind: 'native',
      send: (request) => {
        if (!holding) return Promise.reject(new Error('native bridge unavailable (self-test transport)'));
        return new Promise((resolve) => held.push({ request, resolve, done: false }));
      },
    },
    hold: (on) => {
      holding = on;
    },
    pending: () => held.filter((h) => !h.done).length,
    ack(i) {
      const h = held[i];
      if (!h || h.done) return;
      h.done = true;
      h.resolve({ contract_version: '0.1.0', request_id: h.request.request_id, status: 'accepted', error_code: null });
    },
    ackLatest() {
      this.ack(held.length - 1);
    },
    sent: () => held.length,
  };
}

/** `acceptSyntheticEvents` and a non-default transport are only for the in-page self-test (`?selftest=1`). */
export function boot(role: 'top' | 'frame', acceptSyntheticEvents = false, transport: NativeTransport = unavailableTransport): ProbeHandle {
  const meta = versionMeta(document);
  const session = new ProbeSession({
    identity: SYNTHETIC_IDENTITY,
    ids: randomIds,
    clock: systemClock,
    transport,
    fixtures: FIXTURE_EXPLANATIONS,
    resolveSource: resolveFixtureSource,
    projectId: null,
    knowledgeProfileVersion: 1,
  });
  const events: ProbeEvent[] = [];
  const { host, toolbarRects, cardSnapshot, confirmAdjust, closeCard } = installProbe({
    win: window,
    session,
    documentVersion: () => meta.getAttribute('content'),
    role,
    peerOrigins: FIXTURE_ORIGINS,
    onEvent: (e) => events.push(e),
    acceptSyntheticEvents,
  });
  return { session, events, host, toolbarRects, cardSnapshot, confirmAdjust, closeCard };
}

export function otherFixtureOrigin(): string {
  // Same port, the other loopback name: a real cross-origin peer wherever the check server runs.
  return location.hostname === 'localhost' ? `http://127.0.0.1:${location.port}` : `http://localhost:${location.port}`;
}
