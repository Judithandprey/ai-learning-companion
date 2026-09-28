// P0-12 fixture: an embedded question frame. As an all-frames content script
// would, the observer runs inside the frame and reports its records to the
// parent (window messaging is a fixture stand-in for extension messaging).

import { CHANNEL } from '../../src/page.ts';
import { FIXTURE_ORIGINS } from '../../src/fixture-data.ts';
import { installEntryObserver } from './entry-observer.ts';

const post = (message: Record<string, unknown>): void => {
  for (const origin of FIXTURE_ORIGINS) {
    try {
      window.parent.postMessage({ channel: CHANNEL, ...message }, origin);
    } catch {
      // parent of another origin
    }
  }
};
const reportLayout = (): void => {
  const r = document.getElementById('frame-answer')?.getBoundingClientRect();
  if (r) post({ type: 'entry_layout', x: r.left + r.width / 2, y: r.top + r.height / 2 });
};
reportLayout();
window.addEventListener('load', reportLayout);

installEntryObserver({
  win: window,
  frame: `frame:${location.origin}`,
  ignore: [],
  siteFeedbackSelector: null,
  problemSelector: '[data-problem-id]',
  onRecord: (record) => post({ type: 'entry_record', record }),
});
