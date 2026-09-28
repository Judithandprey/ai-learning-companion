// Strict-CSP fixture page: checks that the probe UI still renders and works when
// the page forbids inline styles and scripts. The page is not a registered
// source, so an ASK here must end as "source not registered".

import { boot, pointOf } from './common.ts';

const handle = boot('top');
const violations: string[] = [];
document.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.violatedDirective}: ${e.blockedURI || 'inline'}`));
let clicks = 0;
document.getElementById('csp-btn')?.addEventListener('click', () => (clicks += 1));

window.__lcProbe = {
  ...handle,
  fixture: {
    point: (selector: string, phrase?: string) => pointOf(document, selector, phrase),
    sweep: (selector: string, phrase: string, n = 8) => {
      const q = pointOf(document, selector, phrase);
      if (!q) return null;
      const out: Record<string, number> = {};
      for (let i = 0; i <= n; i++) {
        out[`x${i}`] = q.left + 2 + ((q.right - q.left - 4) * i) / n;
        out[`y${i}`] = q.y;
      }
      return out;
    },
    toolbar: (mode: string) => {
      const r = handle.toolbarRects()[mode];
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height } : null;
    },
    state: () => ({
      mode: handle.session.state.mode,
      requests: handle.session.explanationRequestCount,
      clicks,
      violations,
      host_position: getComputedStyle(handle.host).position,
      asks: handle.events.filter((e) => e.type === 'ask').map((e) => (e.type === 'ask' ? e.outcome : '')),
    }),
  },
};
