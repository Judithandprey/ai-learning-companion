// Shows that the requestSubmit mutation (which passes the module's safety test) submits
// the learner's form on each edit. DOM double only.
import { installGlobals, makeWindow, HTMLElement, HTMLInputElement, HTMLFormElement } from './dom-double.mjs';
installGlobals();
globalThis.Image = class { set src(v) { globalThis.beacons.push(v); } };
globalThis.WebSocket = class { constructor(u) { globalThis.sockets.push(u); } };
globalThis.beacons = []; globalThis.sockets = [];
const { installEntryObserver } = await import(process.argv[2]);
const w = makeWindow();
const problem = new HTMLElement('section', { 'data-problem-id': 'q1', 'data-problem-version': '1' });
const form = new HTMLFormElement({ id: 'quiz' });
const input = new HTMLInputElement({ id: 'answer', 'data-entry': 'text' });
form.append(input); problem.append(form); w.body.append(problem);
installEntryObserver({ win: w.win, frame: 'top', ignore: [], siteFeedbackSelector: null, problemSelector: '[data-problem-id]', onRecord: () => {} });
w.userType(input, '1');
console.log(JSON.stringify({ observer: process.argv[2].replace(/.*work\/entries-observer\//, ''), formSubmissions: form.submissions, fieldValueAfterLearnerTyped1: input.value, beacons: globalThis.beacons, sockets: globalThis.sockets }));
