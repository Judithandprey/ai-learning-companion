// A page showing two problems at once (e.g. an all-questions-on-one-page quiz), each marked by the adapter selector.
import { installGlobals, makeWindow, HTMLElement, HTMLInputElement } from './dom-double.mjs';
installGlobals();
const { installEntryObserver } = await import('./apps/safari-extension/fixture/src/entry-observer.ts');
const w = makeWindow();
const q1 = new HTMLElement('section', { id: 'q1', 'data-problem-id': 'quiz3-q1', 'data-problem-version': '1' });
const q2 = new HTMLElement('section', { id: 'q2', 'data-problem-id': 'quiz3-q2', 'data-problem-version': '1' });
const a1 = new HTMLInputElement({ id: 'q1-a', type: 'radio', name: 'q1', value: 'A' });
const a2 = new HTMLInputElement({ id: 'q2-a', type: 'radio', name: 'q2', value: 'A' });
const t2 = new HTMLInputElement({ id: 'q2-text', 'data-entry': 'text' });
q1.append(a1); q2.append(a2, t2); w.body.append(q1, q2);
const records = [];
installEntryObserver({ win: w.win, frame: 'top', ignore: [], siteFeedbackSelector: null, problemSelector: '[data-problem-id]', onRecord: (r) => records.push(r) });
w.userClick(a2); w.userType(t2, '7');
console.log(JSON.stringify(records.map((r) => ({ control: r.control, kind: r.kind, enclosingProblem: (r.control === '#q2-a' || r.control === '#q2-text') ? 'quiz3-q2' : '?', recordedProblem: r.problem?.id })), null, 1));
