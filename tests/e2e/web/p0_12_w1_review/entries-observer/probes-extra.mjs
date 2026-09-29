import { installGlobals, makeWindow, HTMLElement, HTMLInputElement, InputEvent } from './dom-double.mjs';
installGlobals();
const { installEntryObserver } = await import('./apps/safari-extension/fixture/src/entry-observer.ts');
const brief = (rs) => rs.map((r) => `${r.kind}:${r.control}:${r.actor}:${r.evidence}:${r.access}${r.detail ? ` [${r.detail}]` : ''}`);
const setup = () => { const w = makeWindow(); const problem = new HTMLElement('section', { 'data-problem-id': 'q1', 'data-problem-version': '1' }); w.body.append(problem); const records = [];
  installEntryObserver({ win: w.win, frame: 'top', ignore: [], siteFeedbackSelector: null, problemSelector: '[data-problem-id]', onRecord: (r) => records.push(r) }); return { ...w, problem, records }; };
const out = {};
for (const [mode, active] of [['closed', true], ['open', true]]) { // scripted click inside the handler of a real user click (live gesture)
  const w = makeWindow(); const problem = new HTMLElement('section', { 'data-problem-id': 'q1', 'data-problem-version': '1' }); w.body.append(problem);
  const host = new HTMLElement('lc-choice', { id: `${mode}-host` }); const box = new HTMLInputElement({ id: 'agree', type: 'checkbox' }); host.attachShadow({ mode }).append(box); problem.append(host);
  const records = []; installEntryObserver({ win: w.win, frame: 'top', ignore: [], siteFeedbackSelector: null, problemSelector: '[data-problem-id]', onRecord: (r) => records.push(r) });
  w.win.navigator.userActivation.isActive = active; w.scriptClick(box); await new Promise((r) => setTimeout(r, 5));
  out[`scriptClick_live_gesture_${mode}_shadow`] = brief(records);
}
{ // custom element WITHOUT any shadow root dispatching its own composed input event (e.g. a light-DOM slider)
  const p = setup(); const slider = new HTMLElement('my-slider', { id: 'slider' }); p.problem.append(slider);
  p.dispatch(new InputEvent('input', { isTrusted: false, composed: true }), slider);
  out.light_dom_custom_element = { hasAnyShadowRoot: slider._shadow !== null, records: brief(p.records) };
}
console.log(JSON.stringify(out, null, 1));
