// QA probes for fixture/src/entry-observer.ts at 71f1389 using Node DOM doubles.
// Usage: node probes.mjs [observerPath]
import { installGlobals, makeWindow, HTMLElement, HTMLInputElement, HTMLSelectElement, HTMLCanvasElement, HTMLFormElement, InputEvent, Event0 } from './dom-double.mjs';

installGlobals();
const observerPath = process.argv[2] ?? './apps/safari-extension/fixture/src/entry-observer.ts';
const { installEntryObserver } = await import(observerPath);
const tick = () => new Promise((r) => setTimeout(r, 5));
const brief = (rs) => rs.map((r) => `${r.kind}:${r.control}:${r.actor}:${r.evidence}${r.before !== undefined ? `:${r.before}` : ''}${r.after !== undefined ? `->${r.after}` : ''}${r.problem ? `@${r.problem.id}` : ''}`);
const out = {};

function page() {
  const w = makeWindow();
  const problem = new HTMLElement('section', { id: 'problem', 'data-problem-id': 'set1-q1', 'data-problem-version': '1' });
  w.body.append(problem);
  const records = [];
  const install = (extra = {}) => installEntryObserver({ win: w.win, frame: 'top', ignore: [], siteFeedbackSelector: '[data-site-feedback]', problemSelector: '[data-problem-id]', onRecord: (r) => records.push(r), ...extra });
  return { ...w, problem, records, install };
}
const radio = (id, name, value) => new HTMLInputElement({ id, type: 'radio', name, value });
const checkbox = (id) => new HTMLInputElement({ id, type: 'checkbox', value: id });

// ---------- HELD controls ----------
{ // light-DOM choices, text, programmatic changes
  const p = page();
  const fs = new HTMLElement('fieldset', { 'data-entry': 'single-choice' });
  const d5 = radio('det-5', 'det', '5'), d6 = radio('det-6', 'det', '6');
  fs.append(d5, d6);
  const inv = checkbox('m-inv'); const multi = new HTMLElement('fieldset', { 'data-entry': 'multi-choice' }); multi.append(inv);
  const txt = new HTMLInputElement({ id: 'q-text', 'data-entry': 'text' });
  p.problem.append(fs, multi, txt);
  p.install();
  p.userClick(d5); p.userClick(d6); p.userClick(d5);
  p.userType(txt, '14');
  txt.value = '12'; p.poll(); // site restores silently
  p.dispatch(new Event0('change', { isTrusted: false, composed: false }), inv); // synthetic no-op change
  p.scriptClick(inv); // site el.click(), no user activation
  await tick();
  out.held_light_dom = brief(p.records);
}
{ // password memory across a type toggle; sensitive autocomplete; password in open shadow
  const p = page();
  const pass = new HTMLInputElement({ id: 'q-pass', type: 'password' });
  const otp = new HTMLInputElement({ id: 'otp', autocomplete: 'one-time-code' });
  const cc = new HTMLInputElement({ id: 'cc', autocomplete: 'billing cc-number' });
  const host = new HTMLElement('lc-login'); const sr = host.attachShadow({ mode: 'open' });
  const inner = new HTMLInputElement({ id: 'inner-pass', type: 'password' }); sr.append(inner);
  p.problem.append(pass, otp, cc, host);
  p.install();
  p.userType(pass, 'hunter2secret');
  pass.type = 'text'; // site "show password"
  p.userType(pass, 'hunter2secretX'); p.poll();
  p.userType(otp, '123456'); p.userType(cc, '4111111111111111'); p.userType(inner, 's3cret'); p.poll();
  out.held_sensitive = { records: p.records.length, leaked: JSON.stringify(p.records).match(/hunter2|123456|4111|s3cret|q-pass/g) };
}
{ // open shadow scripted click is marked; stop() removes listeners
  const p = page();
  const host = new HTMLElement('lc-open-answer', { id: 'open-host' }); const sr = host.attachShadow({ mode: 'open' });
  const sure = checkbox('open-sure'); sr.append(sure); p.problem.append(host);
  const obs = p.install();
  p.scriptClick(sure);
  await tick();
  const before = p.win.listenerCount(); obs.stop();
  out.held_open_shadow_scripted_click = { records: brief(p.records), listenersBeforeStop: before, listenersAfterStop: p.win.listenerCount() };
}

// ---------- F1: closed shadow root + site-scripted click is attributed to the user ----------
{
  const p = page();
  const host = new HTMLElement('lc-closed-choice', { id: 'closed-host' }); const sr = host.attachShadow({ mode: 'closed' });
  const box = checkbox('agree'); sr.append(box); p.problem.append(host);
  p.install();
  p.win.navigator.userActivation.isActive = false; // no user gesture at all
  p.scriptClick(box); // page script: box.click() inside its own closed component
  await tick();
  out.F1_closed_shadow_scripted_click = brief(p.records);
}

// ---------- F2: closed shadow root on a non-custom host leaves no gap record ----------
{
  const p = page();
  const host = new HTMLElement('div', { id: 'div-host' }); const sr = host.attachShadow({ mode: 'closed' });
  const input = new HTMLInputElement({ id: 'inner' }); sr.append(input); p.problem.append(host);
  const custom = new HTMLElement('lc-closed-answer', { id: 'closed-host' }); custom.attachShadow({ mode: 'closed' }).append(new HTMLInputElement({}));
  p.problem.append(custom);
  p.install();
  p.userType(input, '42');
  p.userType(custom._shadow.childNodes[0], '42');
  p.poll();
  out.F2_closed_shadow_div_host = { typedInDivHost: input.value, records: brief(p.records) };
}

// ---------- F3: <select> and ARIA choice widgets are silently dropped (no record, no gap) ----------
{
  const p = page();
  const sel = new HTMLSelectElement({ id: 'q-drop', 'data-entry': 'dropdown' });
  const ariaGroup = new HTMLElement('div', { role: 'radiogroup', 'data-entry': 'aria-choice' });
  const opt = new HTMLElement('div', { id: 'aria-6', role: 'radio', 'aria-checked': 'false', tabindex: '0' });
  ariaGroup.append(opt); p.problem.append(sel, ariaGroup);
  p.install();
  sel.value = '6';
  p.dispatch(new InputEvent('input', { isTrusted: true, composed: true }), sel);
  p.dispatch(new Event0('change', { isTrusted: true }), sel);
  sel.value = '5'; p.dispatch(new Event0('input', { isTrusted: true, composed: true }), sel); p.dispatch(new Event0('change', { isTrusted: true }), sel);
  opt.setAttribute('aria-checked', 'true');
  p.dispatch(new Event0('click', { isTrusted: true, composed: true }), opt);
  p.poll();
  out.F3_select_and_aria = { selectFinal: sel.value, ariaChecked: opt.getAttribute('aria-checked'), records: brief(p.records) };
}

// ---------- F4: site feedback rendered as a new node / visibility toggle is not recorded ----------
{
  const p = page();
  const fs = new HTMLElement('fieldset', { 'data-entry': 'single-choice' });
  const d5 = radio('det-5', 'det', '5'), d6 = radio('det-6', 'det', '6'); fs.append(d5, d6);
  const hiddenAnswer = new HTMLElement('div', { id: 'answer', 'data-site-feedback': '', hidden: '' }); hiddenAnswer.textContent = 'Site answer: det(A) = 6';
  p.problem.append(fs, hiddenAnswer);
  p.install();
  p.userClick(d5);
  // (i) site renders grading by inserting a NEW feedback element into the problem
  const fb = new HTMLElement('div', { id: 'grading', 'data-site-feedback': '' }); fb.textContent = 'Site grading: (a) incorrect. Correct answer: 6';
  p.problem.append(fb);
  p.mutate([{ type: 'childList', target: p.problem, addedNodes: [fb] }]); // DOM spec: childList target is the parent
  // (ii) site reveals a pre-rendered answer by removing `hidden`: not in attributeFilter, so no mutation reaches the callback
  hiddenAnswer.removeAttribute('hidden');
  const filter = p.moOptions().attributeFilter;
  p.userClick(d6); // learner now picks the correct answer
  out.F4_site_feedback_new_node = { attributeFilter: filter, records: brief(p.records), siteFeedbackRecords: p.records.filter((r) => r.kind === 'site_feedback').length };
}

// ---------- F5: everSelected keyed by bare radio name across roots/forms ----------
{
  const p = page();
  const mk = (id) => { const h = new HTMLElement('lc-open-answer', { id }); const sr = h.attachShadow({ mode: 'open' }); sr.append(radio('open-yes', 'open-yn', 'open-yes'), radio('open-no', 'open-yn', 'open-no')); return h; };
  const a = mk('q7-host'), b = mk('q8-host');
  const f1 = new HTMLFormElement({ id: 'f1' }), f2 = new HTMLFormElement({ id: 'f2' });
  f1.append(radio('q1-a', 'choice', 'A')); f2.append(radio('q2-a', 'choice', 'A'));
  p.problem.append(a, b, f1, f2);
  p.install();
  p.userClick(a.shadowRoot.childNodes[0]); // first pick in component instance q7
  p.userClick(b.shadowRoot.childNodes[0]); // first pick in a DIFFERENT instance q8
  p.userClick(f1.childNodes[0]); p.userClick(f2.childNodes[0]); // first pick in form f2
  out.F5_reselect_across_groups = brief(p.records);
}

// ---------- F6: site clears a choice without an event; the user's next click inherits it ----------
{
  const p = page();
  const fs = new HTMLElement('fieldset', { 'data-entry': 'single-choice' });
  const d1 = radio('det-1', 'det', '1'), d6 = radio('det-6', 'det', '6'); fs.append(d1, d6);
  const m = new HTMLElement('fieldset', { 'data-entry': 'multi-choice' }); const trace = checkbox('m-trace'); m.append(trace);
  p.problem.append(fs, m);
  p.install();
  p.userClick(d1); // q1 answer
  // fixture #site-next: rebinding + clearing by script (no events), same task
  p.problem.dataset.problemId = 'set1-q2';
  d1.checked = false;
  p.mutate([{ type: 'attributes', target: p.problem, attributeName: 'data-problem-id' }]);
  p.userClick(d6); // learner answers q2 before the next 200 ms poll
  // checkbox: site checks it silently, learner unchecks it before the poll
  trace.checked = true;
  p.userClick(trace);
  p.poll();
  out.F6_poll_window_attribution = brief(p.records);
}

// ---------- F7: stroke on a canvas without a context fixes its context mode ----------
{
  const p = page();
  const canvas = new HTMLCanvasElement({ id: 'ink', 'data-entry': 'site-canvas' }); p.problem.append(canvas);
  p.install();
  p.pointer('pointerdown', canvas, 10, 10); p.pointer('pointermove', canvas, 40, 30); p.pointer('pointerup', canvas, 40, 30);
  const webgl = canvas.getContext('webgl'); // site initialises its (lazy) WebGL ink renderer afterwards
  let offscreen = 'ok'; try { canvas.transferControlToOffscreen(); } catch (e) { offscreen = e.message; }
  out.F7_canvas_context = { observerCalls: canvas.getContextCalls.slice(0, 1), contextMode: canvas.contextMode, siteWebglContext: webgl, siteOffscreen: offscreen, record: brief(p.records) };
}

// ---------- F8: non-answer personal fields are recorded ----------
{
  const p = page();
  const user = new HTMLInputElement({ id: 'login-user', autocomplete: 'username' });
  const email = new HTMLInputElement({ id: 'contact', type: 'email', autocomplete: 'email' });
  const search = new HTMLInputElement({ id: 'site-search', type: 'search' });
  p.body.append(user, email, search); // outside the problem container
  p.install();
  p.userType(user, 'alice.student'); p.userType(email, 'alice@example.edu'); p.userType(search, 'my grades');
  out.F8_non_answer_fields = brief(p.records);
}

// ---------- F9: script-clears at a problem switch are bound to the new problem with old values ----------
{
  const p = page();
  const txt = new HTMLInputElement({ id: 'q-text', 'data-entry': 'text' }); p.problem.append(txt);
  p.install();
  p.userType(txt, '13');
  p.problem.dataset.problemId = 'set1-q2'; txt.value = '';
  p.mutate([{ type: 'attributes', target: p.problem, attributeName: 'data-problem-id' }]);
  p.poll();
  out.F9_switch_binding = brief(p.records);
}

console.log(JSON.stringify(out, null, 1));
