function evaluate(v) {
  const checks = [];
  const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed: observed ?? null });
  const recs = v.records ?? [];
  const fr = v.frameRecords ?? [];
  const q1 = recs.filter((r) => r.problem?.id === 'set1-q1');
  const pick = (control, list = q1) => list.filter((r) => r.control === control);
  const brief = (list) => list.map((r) => `${r.kind}:${r.actor}:${r.evidence}${r.after !== undefined ? `=${r.after}` : ''}`);

  const radio = q1.filter((r) => r.entry === 'single-choice').map((r) => `${r.kind}(${r.control})`);
  c('entries.radio_select_change_reselect', 'single choice: select 5, change to 6 (5 deselected via group state), change back (reselect 5), all user-attributed',
    JSON.stringify(radio.slice(0, 5)) === JSON.stringify(['select(#det-5)', 'deselect(#det-5)', 'select(#det-6)', 'deselect(#det-6)', 'reselect(#det-5)']) &&
      q1.filter((r) => r.entry === 'single-choice').slice(0, 5).every((r) => r.actor === 'user') &&
      q1.filter((r) => r.kind === 'deselect').slice(0, 2).every((r) => r.evidence === 'group_state'),
    brief(q1.filter((r) => r.entry === 'single-choice')));

  const multiRecs = q1.filter((r) => r.entry === 'multi-choice' && r.actor === 'user');
  const multi = multiRecs.map((r) => `${r.kind}(${r.control}):${r.before}->${r.after}`);
  c('entries.checkbox_check_uncheck', 'multiple choice: check trace, check symmetric, uncheck symmetric (user), each with correct before/after',
    JSON.stringify(multi) === JSON.stringify(['check(#m-trace):off->on', 'check(#m-sym):off->on', 'uncheck(#m-sym):on->off']), multi);

  const units = pick('#q-units');
  c('entries.site_rewrite_not_merged_into_user_edit', 'a site that reformats the field in its own handler: the user edits keep their own before/after, and the site rewrites are separate unknown-actor records',
    JSON.stringify(units.map((r) => `${r.kind}:${r.actor}:${r.before}->${r.after}`)) === JSON.stringify(['text_edit:user:->c', 'change_without_event:unknown:c->C', 'text_edit:user:C->Cm', 'change_without_event:unknown:Cm->CM']),
    units.map((r) => `${r.kind}:${r.actor}:${r.before}->${r.after}`));

  const openChoices = q1.filter((r) => /^#open-host>#open-(yes|no|sure)$/.test(r.control ?? ''));
  c('entries.open_shadow_choices', 'radio group and checkbox inside an open shadow root are recorded from the composed input event, including the derived deselection',
    JSON.stringify(openChoices.map((r) => `${r.kind}(${r.control.split('>')[1]})`)) === JSON.stringify(['select(#open-yes)', 'deselect(#open-yes)', 'select(#open-no)', 'check(#open-sure)']) && openChoices.every((r) => r.actor === 'user'),
    openChoices.map((r) => `${r.kind}(${r.control}):${r.actor}`));

  const pass = JSON.stringify([...recs, ...fr]);
  c('entries.password_never_recorded', 'a password field is never recorded, also after the site switches it to a visible text field',
    !pass.includes('hunter2') && !pass.includes('q-pass') && v.passwordTyped === true,
    { anyRecordForField: pass.includes('q-pass'), valueLeaked: pass.includes('hunter2'), typedIntoField: v.passwordTyped, field: v.passwordField });

  const text = pick('#q-text').filter((r) => r.kind === 'text_edit');
  c('entries.text_edits_before_after', 'text answer: each edit recorded with before/after and input type (14, erase to 1, then 13)',
    JSON.stringify(text.map((r) => [r.before, r.after, r.inputType])) === JSON.stringify([['', '14', 'insertText'], ['14', '1', 'deleteContentBackward'], ['1', '13', 'insertText']]) && text.every((r) => r.actor === 'user'),
    text.map((r) => [r.before, r.after, r.inputType, r.actor]));

  const why = pick('#q-why').filter((r) => r.kind === 'text_edit');
  const formula = pick('#q-formula').filter((r) => r.kind === 'text_edit');
  c('entries.textarea_and_contenteditable', 'textarea and contenteditable formula edits are readable with their final text',
    why.at(-1)?.after === 'sum of squared eigenvalues' && formula.at(-1)?.after === 'λ₁² + λ₂²', { why: why.at(-1)?.after, formula: formula.at(-1)?.after, formulaInputType: formula.at(-1)?.inputType });

  const strokes = q1.filter((r) => r.kind === 'stroke');
  c('entries.site_canvas_visual_only', 'the site canvas stroke is recorded as visual/pointer-only evidence without content, undo or semantics',
    strokes.length === 1 && strokes[0].access === 'visual_only' && strokes[0].evidence === 'pointer_only' && strokes[0].after === undefined && v.valuesAfterUser?.siteStrokes === 1,
    strokes.map((r) => r.detail));

  const open = q1.filter((r) => r.control === '#open-host>#open-input' && r.kind === 'text_edit');
  c('entries.open_shadow_readable', 'input inside an open shadow root: value readable through composedPath', open.at(-1)?.after === 'yes' && open.at(-1)?.actor === 'user', brief(open));

  const closed = q1.filter((r) => r.control === '#closed-host');
  const leaked = JSON.stringify(recs).includes('"no"');
  c('entries.closed_shadow_opaque', 'input inside a closed shadow root: only an opaque change on the host, no value or control',
    closed.length > 0 && closed.every((r) => r.kind === 'opaque_change' && r.access === 'closed_shadow' && r.after === undefined) && !leaked,
    { records: brief(closed), valueLeaked: leaked });

  const sameF = fr.filter((r) => r.frame === 'frame:http://localhost:4173' && r.control === '#frame-answer');
  const crossF = fr.filter((r) => r.frame === 'frame:http://127.0.0.1:4173' && r.control === '#frame-answer');
  c('entries.frames_observed_from_inside', 'embedded answers are recorded by the observer running inside each frame (same- and cross-origin; this probe does not read frame documents from the top); frame records carry no problem binding because the fixture frame has no problem adapter',
    sameF.at(-1)?.after === '2' && crossF.at(-1)?.after === '2' && !recs.some((r) => r.control === '#frame-answer') && [...sameF, ...crossF].every((r) => r.problem === null),
    { same: brief(sameF), cross: brief(crossF), crossOrigins: [...new Set(crossF.map((r) => r.origin))] });

  const restoreText = pick('#q-text').filter((r) => r.kind === 'change_without_event');
  const traceSite = pick('#m-trace').filter((r) => r.actor === 'site_script');
  const symSite = pick('#m-sym').filter((r) => r.actor === 'site_script');
  // A scripted click inside the handler of a user click happens during a live gesture: its source is 'unknown', never 'user'.
  const invSite = pick('#m-inv');
  c('entries.site_restore_attribution', 'site draft restore: a silent value change is actor unknown; a no-op synthetic change is a site no_value_change; a real synthetic change is a site check (off->on); a scripted click() is a site scripted_activation although its change event claims isTrusted',
    restoreText.at(-1)?.after === '12' && restoreText.at(-1)?.actor === 'unknown' &&
      traceSite.length === 1 && traceSite[0].kind === 'no_value_change' && traceSite[0].evidence === 'untrusted_event' &&
      symSite.length === 1 && symSite[0].kind === 'check' && symSite[0].before === 'off' && symSite[0].after === 'on' &&
      invSite.length === 1 && invSite[0].actor !== 'user' && invSite[0].evidence === 'scripted_activation' && /scripted click/.test(invSite[0].detail ?? ''),
    { restoreText: brief(restoreText), trace: brief(traceSite), sym: symSite.map((r) => `${r.kind}:${r.before}->${r.after}`), inv: invSite.map((r) => ({ kind: r.kind, actor: r.actor, evidence: r.evidence, detail: r.detail })) });

  const fb = q1.filter((r) => r.kind === 'site_feedback');
  c('entries.site_feedback_separate', 'site grading and the site-revealed answer are recorded as site feedback, separate from user input',
    fb.some((r) => /Site grading/.test(r.after ?? '')) && fb.some((r) => /Site answer/.test(r.after ?? '')) && fb.every((r) => r.actor === 'site_script'),
    brief(fb));

  const changed = recs.filter((r) => r.kind === 'problem_changed');
  const q2 = recs.filter((r) => r.problem?.id === 'set1-q2');
  const q2Select = q2.filter((r) => r.control === '#det-6' && r.actor === 'user');
  c('entries.problem_change_rebinds', 'moving to the next question is recorded; later answers bind to the new problem (select, not a reselect of the old one); script-cleared answers stay actor unknown',
    changed.length === 1 && changed[0].before === 'set1-q1@1' && changed[0].after === 'set1-q2@1' && q2Select.length === 1 && q2Select[0].kind === 'select' &&
      q2.filter((r) => r.kind === 'change_without_event').every((r) => r.actor === 'unknown'),
    { changed: changed.map((r) => [r.before, r.after]), q2: brief(q2) });

  const vf = v.valuesFinal ?? {};
  c('entries.observer_never_writes', 'final page values are exactly what the user and the site produced (the observer changed nothing)',
    v.valuesAfterUser?.det === '5' && v.valuesAfterUser?.text === '13' && v.valuesAfterUser?.units === 'CM' && JSON.stringify(v.valuesAfterUser?.multi) === JSON.stringify(['m-trace']) && vf.det === '6' && vf.text === '' && vf.problem === 'set1-q2',
    { afterUser: v.valuesAfterUser, final: vf });

  const os = v.overlayState;
  const r1 = q1.filter((r) => r.control === '#det-1');
  c('entries.write_overlay_keeps_answering', 'with WRITE active and a pen used over the question, a finger tap still answers the question; no explanation request',
    v.inkEvents === 1 && os?.mode === 'WRITE' && os?.penObserved === true && os?.requests === 0 && r1.some((r) => r.kind === 'select' && r.actor === 'user'),
    { ink: v.inkEvents, state: os, det1: brief(r1) });
  return checks;
}


export { evaluate };
