import { installGlobals, makeWindow, HTMLElement, HTMLInputElement } from './dom-double.mjs';
installGlobals();
const { installEntryObserver } = await import(process.argv[2]);
const w = makeWindow(); const problem = new HTMLElement('section', { 'data-problem-id': 'q1', 'data-problem-version': '1' });
const pass = new HTMLInputElement({ id: 'q-pass', type: 'password' }); problem.append(pass); w.body.append(problem);
const records = []; installEntryObserver({ win: w.win, frame: 'top', ignore: [], siteFeedbackSelector: null, problemSelector: '[data-problem-id]', onRecord: (r) => records.push(r) });
w.userType(pass, 'hunter2secret'); pass.type = 'text'; w.userType(pass, 'hunter2secretX'); w.poll();
console.log(process.argv[2].includes('mut-sens') ? 'mutant ' : 'pristine', JSON.stringify(records.map((r) => `${r.kind}:${r.control}:${r.before ?? ''}->${r.after ?? ''}`)));
