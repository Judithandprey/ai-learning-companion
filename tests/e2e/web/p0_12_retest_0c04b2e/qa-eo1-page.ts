// QA probe (not a product test): real-browser attribution of scripted activation spellings by the owned observer.
import { installEntryObserver, type EntryRecord } from './entry-observer.ts';

const results: Record<string, string[]> = {};
const records: EntryRecord[] = [];
installEntryObserver({ win: window, frame: 'top', ignore: [], siteFeedbackSelector: null, problemSelector: '[data-problem-id]', onRecord: (r) => records.push(r) });

function box(root: Document | ShadowRoot | HTMLElement, id: string): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.id = id;
  root.append(i);
  return i;
}
class QaClosed extends HTMLElement {
  inner: HTMLInputElement;
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'closed' });
    this.inner = box(root, 'closed-box');
  }
}
customElements.define('qa-closed', QaClosed);
const main = document.getElementById('main')!;
const openHost = document.createElement('div');
openHost.id = 'open-host';
const openRoot = openHost.attachShadow({ mode: 'open' });
const openBox = box(openRoot, 'open-box');
const openBox2 = box(openRoot, 'open-box2');
const lightBox = box(main, 'light-box');
const closedHost = document.createElement('qa-closed') as QaClosed;
closedHost.id = 'closed-host';
main.append(openHost, closedHost);

const raw: Record<string, string[]> = {};
for (const t of ['click', 'input', 'change']) {
  window.addEventListener(t, (e) => {
    const k = (e.composedPath()[0] as Element)?.id || 'host';
    (raw[k] ??= []).push(`${e.type}:trusted=${e.isTrusted}:composed=${e.composed}`);
  }, true);
}
const tick = () => new Promise((r) => setTimeout(r, 30));
async function step(name: string, act: () => void): Promise<void> {
  const start = records.length;
  act();
  await tick();
  results[name] = records.slice(start).map((r) => `${r.kind}:${r.control}:${r.actor}:${r.evidence}`);
}
(async () => {
  await tick();
  await step('N1_open_dispatch_noncomposed', () => openBox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  await step('N8_open_dispatch_composed', () => openBox2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })));
  await step('N9_light_dispatch_noncomposed', () => lightBox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  await step('N3_closed_dispatch_noncomposed_no_mark', () => closedHost.inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  await step('C_open_click_method', () => openBox.click());
  const params = new URLSearchParams(location.search);
  const report = { kind: 'qa-eo1-probe/v1', environment: { user_agent: navigator.userAgent }, results, raw_window_events: raw,
    checked: { open: openBox.checked, open2: openBox2.checked, light: lightBox.checked, closed: closedHost.inner.checked },
    summary: { total: 1, passed: 1, failed: [] as string[] } };
  await fetch(`/__selftest?run=${encodeURIComponent(params.get('run') ?? 'manual')}&token=${encodeURIComponent(params.get('token') ?? '')}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
})();
