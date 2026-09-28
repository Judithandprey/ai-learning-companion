// P0-12 fixture: a quiz-like page that behaves the way course sites do (own
// drawing canvas, web components, restoring drafts from script, grading, showing
// the answer, moving to the next question), plus the answer-entry observer and
// the input probe. The observer only watches; the "site" code below is the page's
// own behavior, not something the probe does.

import { CHANNEL } from '../../src/page.ts';
import { FIXTURE_ORIGINS } from '../../src/fixture-data.ts';
import { boot, otherFixtureOrigin, pointOf } from './common.ts';
import { installEntryObserver, type EntryRecord } from './entry-observer.ts';

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
};

// ---- site: web components with open and closed shadow roots -----------------
class OpenAnswer extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    input.id = 'open-input';
    input.size = 6;
    input.setAttribute('aria-label', 'Answer inside an open shadow root');
    const choice = (type: 'radio' | 'checkbox', id: string, name: string, label: string): HTMLLabelElement => {
      const l = document.createElement('label');
      const i = document.createElement('input');
      i.type = type;
      i.id = id;
      i.name = name;
      i.value = id;
      l.append(i, ` ${label} `);
      return l;
    };
    root.append(input, choice('radio', 'open-yes', 'open-yn', 'yes'), choice('radio', 'open-no', 'open-yn', 'no'), choice('checkbox', 'open-sure', 'open-sure', 'sure'));
  }
}
class ClosedAnswer extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'closed' });
    const input = document.createElement('input');
    input.size = 6;
    input.setAttribute('aria-label', 'Answer inside a closed shadow root');
    root.append(input);
  }
}
customElements.define('lc-open-answer', OpenAnswer);
customElements.define('lc-closed-answer', ClosedAnswer);

// ---- site: its own drawing canvas with its own undo ---------------------------
const canvas = $<HTMLCanvasElement>('site-canvas');
const ctx = canvas.getContext('2d')!;
const siteStrokes: Array<Array<{ x: number; y: number }>> = [];
let drawing: Array<{ x: number; y: number }> | null = null;
const redrawSite = (): void => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1c1c1e';
  ctx.lineWidth = 2;
  for (const s of siteStrokes) {
    ctx.beginPath();
    s.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
};
const local = (e: PointerEvent): { x: number; y: number } => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
canvas.addEventListener('pointerdown', (e) => {
  drawing = [local(e)];
  siteStrokes.push(drawing);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  drawing.push(local(e));
  redrawSite();
});
canvas.addEventListener('pointerup', () => (drawing = null));
canvas.addEventListener('keydown', (e) => {
  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
    siteStrokes.pop();
    redrawSite();
  }
});

// ---- site: draft restore, grading, answer reveal, next question -------------
const feedback = $('site-feedback');
$('site-restore').addEventListener('click', () => {
  // Typical site behaviors: silent value restore, synthetic change events (one that
  // changes nothing, one that does), and a scripted click.
  $<HTMLInputElement>('q-text').value = '12';
  const trace = $<HTMLInputElement>('m-trace');
  trace.checked = true;
  trace.dispatchEvent(new Event('change', { bubbles: true }));
  const sym = $<HTMLInputElement>('m-sym');
  sym.checked = true;
  sym.dispatchEvent(new Event('change', { bubbles: true }));
  $<HTMLInputElement>('m-inv').click();
});
// The site reformats the units field in its own input handler (after the observer saw the edit).
$('q-units').addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  t.value = t.value.toUpperCase();
});
$('site-show-password').addEventListener('click', () => {
  const p = $<HTMLInputElement>('q-pass');
  p.type = p.type === 'password' ? 'text' : 'password';
});
$('site-check').addEventListener('click', () => {
  const det = document.querySelector<HTMLInputElement>('input[name="det"]:checked')?.value;
  feedback.textContent = `Site grading: (a) ${det === '6' ? 'correct' : 'incorrect'}.`;
});
$('site-reveal').addEventListener('click', () => {
  feedback.textContent = 'Site answer: det(A) = 6; trace(A) = 5; A is invertible; trace(A²) = 13.';
});
$('site-next').addEventListener('click', () => {
  const problem = $('problem');
  problem.dataset['problemId'] = 'set1-q2';
  problem.dataset['problemVersion'] = '1';
  $('problem-title').textContent = 'Question 2';
  $('stem').textContent = 'Let B be a 2×2 matrix with eigenvalues −1 and 4. Which statements are true?';
  document.querySelectorAll<HTMLInputElement>('#problem input').forEach((i) => {
    if (i.type === 'radio' || i.type === 'checkbox') i.checked = false;
    else i.value = '';
  });
  feedback.textContent = '';
});

// ---- probe and observer --------------------------------------------------------
const handle = boot('top');
const records: EntryRecord[] = [];
const frameRecords: Array<EntryRecord & { origin: string }> = [];
const frameLayouts: Record<string, { x: number; y: number }> = {};
const observer = installEntryObserver({
  win: window,
  frame: 'top',
  ignore: [handle.host],
  siteFeedbackSelector: '[data-site-feedback]',
  problemSelector: '[data-problem-id]',
  onRecord: (r) => records.push(r),
});
const other = otherFixtureOrigin();
$<HTMLIFrameElement>('entry-frame-cross').src = `${other}/fixture/entry-frame.html`;
window.addEventListener('message', (e: MessageEvent) => {
  if (!FIXTURE_ORIGINS.includes(e.origin)) return;
  const frames = Array.from(document.querySelectorAll('iframe'), (f) => f.contentWindow);
  if (!frames.includes(e.source as Window)) return;
  const data = e.data as { channel?: string; type?: string; record?: EntryRecord; x?: number; y?: number } | null;
  if (data?.channel !== CHANNEL) return;
  if (data.type === 'entry_record' && data.record) frameRecords.push({ ...data.record, origin: e.origin });
  if (data.type === 'entry_layout' && typeof data.x === 'number' && typeof data.y === 'number') frameLayouts[e.origin] = { x: data.x, y: data.y };
});

// Frames may have loaded before this listener existed: ask each frame for its layout.
const requestLayouts = (): void => {
  for (const f of Array.from(document.querySelectorAll('iframe'))) {
    for (const origin of FIXTURE_ORIGINS) {
      try {
        f.contentWindow?.postMessage({ channel: CHANNEL, type: 'entry_layout_request' }, origin);
      } catch {
        // other origin
      }
    }
  }
};
requestLayouts();
for (const f of Array.from(document.querySelectorAll('iframe'))) f.addEventListener('load', requestLayouts);

window.__lcProbe = {
  ...handle,
  entries: { records, frameRecords, stop: observer.stop },
  fixture: {
    point: (selector: string, phrase?: string) => pointOf(document, selector, phrase),
    /** Center of an element inside a same-origin shadow root or frame is not needed; hosts and frames are addressed by their own boxes. */
    box: (selector: string) => {
      const el = document.querySelector(selector);
      el?.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
    },
    /** Viewport point of the answer input inside a frame, from the frame's own layout report (works cross-origin). */
    /** Center of a control inside an open shadow root (test addressing only). */
    shadowPoint: (hostSel: string, innerSel: string) => {
      const host = document.querySelector(hostSel);
      host?.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = host?.shadowRoot?.querySelector(innerSel)?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    },
    framePoint: (frameId: string) => {
      const f = document.getElementById(frameId) as HTMLIFrameElement | null;
      const origin = f?.src ? new URL(f.src, location.href).origin : null;
      const inner = origin ? frameLayouts[origin] : undefined;
      if (!f || !inner) return null;
      f.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = f.getBoundingClientRect();
      return { x: r.left + f.clientLeft + inner.x, y: r.top + f.clientTop + inner.y };
    },
    frameLayoutsReady: () => Object.keys(frameLayouts).length,
    sweep: (selector: string, phrase: string, n = 8) => {
      document.querySelector(selector)?.scrollIntoView({ block: 'center', behavior: 'instant' });
      const q = pointOf(document, selector, phrase);
      if (!q) return null;
      const out: Record<string, number> = {};
      for (let i = 0; i <= n; i++) {
        out[`x${i}`] = q.left + 2 + ((q.right - q.left - 4) * i) / n;
        out[`y${i}`] = q.y + (i === n ? 1 : 0);
      }
      return out;
    },
    canvasPath: () => {
      canvas.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = canvas.getBoundingClientRect();
      const out: Record<string, number> = {};
      for (let i = 0; i <= 8; i++) {
        out[`x${i}`] = r.left + 30 + i * 30;
        out[`y${i}`] = r.top + 30 + (i % 2) * 40;
      }
      return out;
    },
    toolbar: (mode: string) => {
      const r = handle.toolbarRects()[mode];
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    },
    values: () => ({
      det: document.querySelector<HTMLInputElement>('input[name="det"]:checked')?.value ?? null,
      multi: Array.from(document.querySelectorAll<HTMLInputElement>('#q-multi input:checked'), (i) => i.id),
      text: $<HTMLInputElement>('q-text').value,
      units: $<HTMLInputElement>('q-units').value,
      why: $<HTMLTextAreaElement>('q-why').value,
      formula: $('q-formula').textContent,
      open: (document.getElementById('open-host')?.shadowRoot?.querySelector('input') as HTMLInputElement | null)?.value ?? null,
      siteStrokes: siteStrokes.length,
      feedback: feedback.textContent,
      problem: $('problem').dataset['problemId'],
    }),
    state: () => ({ mode: handle.session.state.mode, penObserved: handle.session.penObserved, requests: handle.session.explanationRequestCount, scrollY }),
    inkEvents: () => handle.events.filter((e) => e.type === 'ink').length,
  },
};
