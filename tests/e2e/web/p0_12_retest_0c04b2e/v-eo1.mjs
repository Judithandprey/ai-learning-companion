// Verifier (verify-web-observer, candidate 0c04b2e): EO-1 closed/open-root attribution.
// DOM double only (not browser evidence). UA facts assumed from the DOM/HTML specs and the
// repo's own Edge evidence:
//  - el.click(): "fire a synthetic pointer event" -> untrusted, bubbles, COMPOSED click.
//  - el.dispatchEvent(new MouseEvent('click', {bubbles:true})): untrusted, NOT composed
//    (MouseEventInit.composed defaults to false); a click MouseEvent still runs the
//    checkbox activation behavior regardless of isTrusted/composed.
//  - checkbox activation: "fire an event named input ... bubbles and composed" (isTrusted
//    true, per "fire an event"), then change (bubbles, not composed, trusted).
// Usage: node v-eo1.mjs [observerPath]
import { installGlobals, makeWindow, HTMLElement, HTMLInputElement, InputEvent, Event0, MouseEvent } from './dom-double.mjs';

installGlobals();
const observerPath = process.argv[2] ?? './apps/safari-extension/fixture/src/entry-observer.ts';
const { installEntryObserver } = await import(observerPath);
const macrotask = () => new Promise((r) => setTimeout(r, 5));
const brief = (rs) => rs.map((r) => `${r.kind}:${r.control}:${r.actor}:${r.evidence}`);

function page() {
  const w = makeWindow();
  const problem = new HTMLElement('section', { id: 'problem', 'data-problem-id': 'q1', 'data-problem-version': '1' });
  w.body.append(problem);
  const records = [];
  installEntryObserver({ win: w.win, frame: 'top', ignore: [], siteFeedbackSelector: null, problemSelector: '[data-problem-id]', onRecord: (r) => records.push(r) });
  const act = (on) => { w.win.navigator.userActivation.isActive = on; };
  const toggle = (box) => { box.checked = !box.checked; };
  const click = (t, trusted, composed = true) => w.dispatch(new MouseEvent('click', { isTrusted: trusted, composed }), t);
  const activation = (box) => { toggle(box); w.dispatch(new InputEvent('input', { isTrusted: true, composed: true }), box); w.dispatch(new Event0('change', { isTrusted: true, composed: false }), box); };
  /** el.click() from page script. */
  const scriptClick = (box) => { click(box, false, true); activation(box); };
  /** el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) (MDN's "simulate a click" pattern). */
  const dispatchClick = (box) => { click(box, false, false); activation(box); };
  /** dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })). */
  const dispatchClickComposed = (box) => { click(box, false, true); activation(box); };
  const syntheticInput = (box) => { toggle(box); w.dispatch(new InputEvent('input', { isTrusted: false, composed: true }), box); };
  const key = (t, trusted = true) => w.dispatch(new Event0('keydown', { isTrusted: trusted, composed: true }), t);
  /** Real user click on `target`; site target-phase click handlers run after the observer's window capture listener. */
  const userClick = (target, { siteOnClick, toggles = true } = {}) => {
    act(true);
    click(target, true);
    siteOnClick?.();
    if (toggles) activation(target);
  };
  return { ...w, problem, records, act, scriptClick, dispatchClick, dispatchClickComposed, syntheticInput, key, userClick };
}
const comp = (p, id, mode) => {
  const host = new HTMLElement('lc-quiz-choice', { id });
  const root = host.attachShadow({ mode });
  const a = new HTMLInputElement({ id: 'a', type: 'checkbox' });
  const b = new HTMLInputElement({ id: 'b', type: 'checkbox' });
  const none = new HTMLInputElement({ id: 'none', type: 'checkbox' });
  const showAnswer = new HTMLElement('button', { id: 'show' });
  root.append(a, b, none, showAnswer);
  p.problem.append(host);
  return { host, root, a, b, none, showAnswer };
};
const out = {};
const run = async (name, fn) => {
  const p = page();
  try { await fn(p); } catch (e) { out[name] = `ERROR ${e.stack}`; return; }
  await macrotask();
  out[name] = brief(p.records);
};

// --- Re-check of the reviewer's core EO-1 scenarios (composed click / synthetic input) ---
await run('R_A1_closed_script_click_no_gesture', (p) => { const c = comp(p, 'h', 'closed'); p.act(false); p.scriptClick(c.a); });
await run('R_A2_closed_script_click_live_gesture', (p) => { const c = comp(p, 'h', 'closed'); p.act(true); p.scriptClick(c.a); });
await run('R_B1_closed_synthetic_input_no_mark', (p) => { const c = comp(p, 'h', 'closed'); p.act(false); p.syntheticInput(c.a); });
await run('R_B2_closed_user_click_show_then_synthetic_input', (p) => { const c = comp(p, 'h', 'closed'); p.userClick(c.showAnswer, { toggles: false, siteOnClick: () => p.syntheticInput(c.a) }); });
await run('R_D1_closed_user_click_show_then_script_click', (p) => { const c = comp(p, 'h', 'closed'); p.userClick(c.showAnswer, { toggles: false, siteOnClick: () => p.scriptClick(c.a) }); });
await run('R_E1_closed_user_key_then_script_click', (p) => { const c = comp(p, 'h', 'closed'); p.act(true); p.key(c.showAnswer); p.scriptClick(c.a); });
await run('R_H1_open_script_click_no_gesture', (p) => { const c = comp(p, 'h', 'open'); p.act(false); p.scriptClick(c.a); });
await run('R_POS_closed_user_click_box', (p) => { const c = comp(p, 'h', 'closed'); p.userClick(c.a); });
await run('R_POS_open_user_click_box', (p) => { const c = comp(p, 'h', 'open'); p.userClick(c.a); });

// --- NEW: dispatchEvent(new MouseEvent('click', {bubbles:true})) is NOT composed ---
await run('N1_open_dispatch_click_no_gesture', (p) => { const c = comp(p, 'h', 'open'); p.act(false); p.dispatchClick(c.a); });
await run('N2_open_dispatch_click_timer_no_gesture', async (p) => { const c = comp(p, 'h', 'open'); p.act(false); await new Promise((r) => setTimeout(() => { p.dispatchClick(c.b); r(); }, 1)); });
await run('N3_closed_dispatch_click_no_gesture', (p) => { const c = comp(p, 'h', 'closed'); p.act(false); p.dispatchClick(c.a); });
await run('N4_closed_user_click_show_answer_then_site_dispatch_click_answer', (p) => { const c = comp(p, 'h', 'closed'); p.userClick(c.showAnswer, { toggles: false, siteOnClick: () => p.dispatchClick(c.b) }); });
await run('N5_closed_user_checks_none_site_dispatch_unchecks_a', (p) => { const c = comp(p, 'h', 'closed'); c.a.checked = true; p.userClick(c.none, { siteOnClick: () => p.dispatchClick(c.a) }); });
await run('N6_closed_user_key_then_site_dispatch_click', (p) => { const c = comp(p, 'h', 'closed'); p.act(true); p.key(c.showAnswer); p.dispatchClick(c.b); });
await run('N7_open_user_click_show_answer_then_site_dispatch_click_answer', (p) => { const c = comp(p, 'h', 'open'); p.userClick(c.showAnswer, { toggles: false, siteOnClick: () => p.dispatchClick(c.b) }); });
await run('N8_open_dispatch_click_composed_no_gesture_control', (p) => { const c = comp(p, 'h', 'open'); p.act(false); p.dispatchClickComposed(c.a); });
await run('N9_light_dom_dispatch_click_no_gesture_control', (p) => { const box = new HTMLInputElement({ id: 'lb', type: 'checkbox' }); p.problem.append(box); p.act(false); p.dispatchClick(box); });
await run('N10_open_radio_dispatch_click_no_gesture', (p) => {
  const host = new HTMLElement('lc-radio', { id: 'rh' }); const root = host.attachShadow({ mode: 'open' });
  const r1 = new HTMLInputElement({ id: 'r1', type: 'radio', name: 'g', value: '1' }); const r2 = new HTMLInputElement({ id: 'r2', type: 'radio', name: 'g', value: '2' });
  root.append(r1, r2); p.problem.append(host);
  p.act(false);
  // site preselects the correct answer by dispatching a click (radio activation sets checked, unchecks the group)
  p.dispatch(new MouseEvent('click', { isTrusted: false, composed: false }), r2); r2.checked = true;
  p.dispatch(new InputEvent('input', { isTrusted: true, composed: true }), r2); p.dispatch(new Event0('change', { isTrusted: true, composed: false }), r2);
});

console.log(JSON.stringify(out, null, 1));
