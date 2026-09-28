// Embedded fixture frame: runs the probe as a follower of the parent's mode,
// as an all-frames content script would, and reports its state to the parent.

import { CHANNEL } from '../../src/page.ts';
import { FIXTURE_ORIGINS } from '../../src/fixture-data.ts';
import { boot, pointOf } from './common.ts';

// Synthetic events are accepted only when a same-origin parent runs the self-test.
const parentSelfTest = (() => {
  try {
    return window.parent !== window && new URLSearchParams(window.parent.location.search).get('selftest') === '1';
  } catch {
    return false;
  }
})();
const handle = boot('frame', parentSelfTest);
window.__lcProbe = { ...handle };

let clicks = 0;
document.getElementById('frame-btn')?.addEventListener('click', () => {
  clicks += 1;
  const out = document.getElementById('frame-counter');
  if (out) out.textContent = String(clicks);
});

function report(): void {
  const lastAsk = [...handle.events].reverse().find((e) => e.type === 'ask');
  const card = lastAsk && lastAsk.type === 'ask' ? (lastAsk.detail['card'] as { status?: string; provenance?: string } | undefined) : undefined;
  const selection = lastAsk && lastAsk.type === 'ask' ? (lastAsk.detail['selection'] as { source_id?: string; selected_text?: string } | undefined) : undefined;
  const state = {
    channel: CHANNEL,
    type: 'frame_state',
    origin: location.origin,
    mode: handle.session.state.mode,
    explanation_requests: handle.session.explanationRequestCount,
    clicks,
    phrase_rect: pointOf(document, '#p-proj', 'orthogonal projection'),
    last_ask: lastAsk && lastAsk.type === 'ask' ? { status: lastAsk.outcome, card_status: card?.status ?? null, provenance: card?.provenance ?? null, source_id: selection?.source_id ?? null, selected_text: selection?.selected_text ?? null } : null,
  };
  for (const origin of FIXTURE_ORIGINS) {
    try {
      window.parent.postMessage(state, origin);
    } catch {
      // parent has another origin
    }
  }
}

handle.session.subscribe(() => setTimeout(report, 0));
const push = handle.events.push.bind(handle.events);
handle.events.push = (...items) => {
  const n = push(...items);
  if (items.some((e) => e.type === 'ask')) setTimeout(report, 0);
  return n;
};
report();
document.getElementById('frame-btn')?.addEventListener('click', () => setTimeout(report, 0));
