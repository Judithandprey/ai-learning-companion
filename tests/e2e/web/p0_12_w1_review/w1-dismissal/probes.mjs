// W-1 dismissal probes against the real installProbe with DOM doubles and a controllable
// deferred transport. Synthetic doubles only: NOT browser, pointer-routing or visual evidence.
// Usage: W1_ROOT=<export root containing apps/> node probes.mjs [--json]
import { setup, deferred, digestGate, tick, brief, askBrief, ORIGIN, CHANNEL } from './harness.mjs';

const checks = [];
const results = {};
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok }); results[name] = { ok: !!ok, detail }; };
const FIX = 'Fixture card';

// ---- S1: close a pending card, then immediately a newer submission ----------------------
for (const order of ['A_then_B', 'B_then_A']) {
  const d = deferred();
  const p = setup({ transport: d.transport });
  p.session.press('ASK'); p.markText('change of basis'); await tick();
  const pendA = p.snap();
  p.clickClose();
  const afterClose = p.snap();
  p.session.press('ASK'); p.markText('eigenvector'); await tick();
  const pendB = p.snap();
  const [first, second] = order === 'A_then_B' ? [0, 1] : [1, 0];
  d.ack(first); await tick(); const mid = p.snap();
  d.ack(second); await tick(); const fin = p.snap();
  const a = p.asks();
  const ok = pendA.pending && pendA.pendingClass && afterClose.hidden && !afterClose.pending && pendB.pending && !pendB.hidden && pendB.quote.includes('eigenvector') &&
    !fin.hidden && !fin.pending && !fin.pendingClass && fin.quote.includes('eigenvector') && fin.badge.startsWith(FIX) &&
    a.length === 2 && a.find((e) => askBrief(e).text === 'change of basis')?.presented === false && a.find((e) => askBrief(e).text === 'eigenvector')?.presented === true &&
    (order === 'A_then_B' ? (mid.pending && !mid.hidden && mid.quote.includes('eigenvector')) : (!mid.hidden && mid.badge.startsWith(FIX)));
  check(`S1.close_pending_then_newer.${order}`, ok, { pendA: brief(pendA), afterClose: brief(afterClose), pendB: brief(pendB), mid: brief(mid), fin: brief(fin), asks: a.map(askBrief) });
}

// ---- S1b: close the pending card, no newer ASK; the late answer must stay hidden ----------
{
  const d = deferred();
  const p = setup({ transport: d.transport });
  p.session.press('ASK'); p.markText('change of basis'); await tick();
  const pend = p.snap();
  p.clickClose();
  d.ack(0); await tick();
  const fin = p.snap(); const a = p.asks();
  check('S1b.close_pending_then_late_answer_hidden', pend.pending && fin.hidden && !fin.pending && a.length === 1 && a[0].outcome === 'submitted' && a[0].presented === false,
    { pend: brief(pend), fin: brief(fin), asks: a.map(askBrief) });
}

// ---- S2: two rapid submissions A, B in consecutive ASKs; bridge answers in both orders ----
for (const order of ['A_then_B', 'B_then_A']) {
  const d = deferred();
  const p = setup({ transport: d.transport });
  p.session.press('ASK'); p.markText('change of basis'); await tick();
  p.session.press('ASK');
  const afterNewAsk = p.snap();
  p.markText('eigenvector'); await tick();
  const [first, second] = order === 'A_then_B' ? [0, 1] : [1, 0];
  d.ack(first); await tick(); const mid = p.snap();
  d.ack(second); await tick(); const fin = p.snap();
  const a = p.asks();
  const midOk = order === 'A_then_B' ? mid.pending && !mid.hidden && mid.quote.includes('eigenvector') : !mid.hidden && !mid.pending && mid.badge.startsWith(FIX) && mid.quote.includes('eigenvector');
  check(`S2.two_submissions.${order}`, afterNewAsk.hidden && midOk && !fin.hidden && !fin.pending && fin.quote.includes('eigenvector') && fin.badge.startsWith(FIX) && a.length === 2 &&
    a.find((e) => askBrief(e).text === 'change of basis')?.presented === false && a.find((e) => askBrief(e).text === 'eigenvector')?.presented === true,
    { afterNewAsk: brief(afterNewAsk), mid: brief(mid), fin: brief(fin), asks: a.map(askBrief) });
}

// ---- S2c: two marks inside ONE ASK while the first is still hashing ----------------------
{
  const g = digestGate();
  const d = deferred();
  const p = setup({ transport: d.transport });
  p.session.press('ASK');
  g.hold(true);
  p.markText('change of basis');
  const pendA = p.snap();
  p.markText('eigenvector'); // still ASK: the first capture has not finished hashing
  const pendB = p.snap();
  g.hold(false); g.releaseAll(); await tick();
  const sent = d.waiting.length;
  if (sent) { d.ack(0); await tick(); }
  const fin = p.snap(); const a = p.asks();
  g.restore();
  results['S2c.double_mark_same_ask_observed'] = { pendA: brief(pendA), pendB: brief(pendB), bridgeRequestsSent: sent, explanationRequests: p.session.explanationRequestCount, fin: brief(fin), asks: a.map(askBrief), mode: p.session.state.mode };
}

// ---- S3: close an older top card while a frame request is still in flight ----------------
{
  const p = setup();
  p.session.press('ASK'); p.markText('eigenvector'); await tick(); // older finished top card
  const older = p.snap();
  p.session.press('ASK'); const epoch = p.session.state.askEpoch;
  p.clickClose(); // user closes the older card while the frame's request is still pending
  const relay = { provenance: 'fixture', source_id: 'web-probe-fixture', source_version: 1, selected_text: 'change of basis' };
  p.msg(p.child, 'ask_done', { askEpoch: epoch }); p.msg(p.child, 'card', { askEpoch: epoch, ...relay });
  const fin = p.snap();
  check('S3.close_older_card_then_frame_relay_shown', !older.hidden && !fin.hidden && fin.quote.includes('change of basis') && p.events.filter((e) => e.type === 'card_relayed').length === 1,
    { older: brief(older), fin: brief(fin), rejected: p.events.filter((e) => e.type === 'message_rejected').map((e) => e.reason) });
}
// S3b: frame completes while a top mark is still hashing (top still in the same ASK)
{
  const g = digestGate();
  const d = deferred();
  const p = setup({ transport: d.transport });
  p.session.press('ASK'); const epoch = p.session.state.askEpoch;
  g.hold(true); p.markText('eigenvector'); const pendT = p.snap();
  const relay = { provenance: 'fixture', source_id: 'web-probe-fixture', source_version: 1, selected_text: 'change of basis' };
  p.msg(p.child, 'ask_done', { askEpoch: epoch }); p.msg(p.child, 'card', { askEpoch: epoch, ...relay });
  const afterRelay = p.snap();
  g.hold(false); g.releaseAll(); await tick();
  const fin = p.snap(); const a = p.asks();
  g.restore();
  check('S3b.frame_relay_during_top_hashing_consistent', pendT.pending && !afterRelay.pending && afterRelay.quote.includes('change of basis') && !fin.hidden && fin.quote.includes('change of basis') &&
    a.length === 1 && a[0].outcome === 'not_in_ask' && a[0].presented === false && d.waiting.length === 0,
    { pendT: brief(pendT), afterRelay: brief(afterRelay), fin: brief(fin), asks: a.map(askBrief) });
}
// S3c: top request pending (bridge), user starts a new ASK, frame card shown, late top answer must not overwrite it
{
  const d = deferred();
  const p = setup({ transport: d.transport });
  p.session.press('ASK'); p.markText('eigenvector'); await tick();
  p.session.press('ASK'); const epoch = p.session.state.askEpoch;
  const relay = { provenance: 'fixture', source_id: 'web-probe-fixture', source_version: 1, selected_text: 'change of basis' };
  p.msg(p.child, 'ask_done', { askEpoch: epoch }); p.msg(p.child, 'card', { askEpoch: epoch, ...relay });
  const frameCard = p.snap();
  d.ack(0); await tick();
  const fin = p.snap(); const a = p.asks();
  check('S3c.late_top_answer_does_not_overwrite_frame_card', !frameCard.hidden && frameCard.quote.includes('change of basis') && !fin.hidden && fin.quote.includes('change of basis') && a.length === 1 && a[0].presented === false,
    { frameCard: brief(frameCard), fin: brief(fin), asks: a.map(askBrief) });
}

// S3d (observation): close the older card in the gap between the frame's ask_done and its card relay
{
  const p = setup();
  p.session.press('ASK'); p.markText('eigenvector'); await tick();
  p.session.press('ASK'); const epoch = p.session.state.askEpoch;
  const relay = { provenance: 'fixture', source_id: 'web-probe-fixture', source_version: 1, selected_text: 'change of basis' };
  p.msg(p.child, 'ask_done', { askEpoch: epoch });
  const beforeClose = p.snap();
  p.clickClose();
  p.msg(p.child, 'card', { askEpoch: epoch, ...relay });
  results['S3d.close_older_card_between_ask_done_and_relay_observed'] = { beforeClose: brief(beforeClose), fin: brief(p.snap()), rejected: p.events.filter((e) => e.type === 'message_rejected').map((e) => e.reason), relayed: p.events.filter((e) => e.type === 'card_relayed').length };
}

// ---- S4: frame-originated messages while the top pending card is shown -------------------
{
  const d = deferred();
  const p = setup({ transport: d.transport });
  p.session.press('ASK'); const epoch = p.session.state.askEpoch; p.markText('eigenvector'); await tick();
  const pend = p.snap();
  const relay = { provenance: 'fixture', source_id: 'web-probe-fixture', source_version: 1, selected_text: 'change of basis' };
  p.msg(p.child, 'ask_cancelled', { askEpoch: epoch });
  p.msg(p.child, 'mode', { mode: 'ASK', askEpoch: epoch + 1 });
  p.msg(p.child, 'pen_observed');
  p.msg(p.child, 'ask_done', { askEpoch: epoch });
  p.msg(p.child, 'card', { askEpoch: epoch, ...relay });
  const afterFrameMsgs = p.snap();
  d.ack(0); await tick();
  const fin = p.snap(); const a = p.asks();
  check('S4.frame_messages_cannot_retire_or_overwrite_top_pending', pend.pending && afterFrameMsgs.pending && afterFrameMsgs.quote.includes('eigenvector') && p.session.state.mode === 'NAV' && p.session.state.askEpoch === epoch &&
    !fin.hidden && fin.badge.startsWith(FIX) && fin.quote.includes('eigenvector') && a.length === 1 && a[0].presented === true,
    { pend: brief(pend), afterFrameMsgs: brief(afterFrameMsgs), fin: brief(fin), asks: a.map(askBrief), rejected: p.events.filter((e) => e.type === 'message_rejected').map((e) => e.reason) });
}

// ---- S5: adjust-box confirm path --------------------------------------------------------
{
  const d = deferred();
  const p = setup({ transport: d.transport });
  p.session.press('ASK'); p.markText('eigenvector'); await tick(); d.ack(0); await tick(); // older finished card
  const older = p.snap();
  p.session.press('ASK');
  p.pen([{ x: 245, y: 190 }, { x: 250, y: 250 }]);
  const adjusted = p.events.some((e) => e.type === 'adjust');
  const beforeConfirm = p.snap();
  p.clickConfirm();
  const pend = p.snap();
  await tick(); d.ack(1); await tick();
  const fin = p.snap(); const a = p.asks();
  check('S5.adjust_confirm_shows_pending_then_answer', adjusted && !older.hidden && !older.anchorHidden && beforeConfirm.quote.includes('eigenvector') && !beforeConfirm.pending && pend.pending && pend.pendingClass && pend.anchorHidden && pend.badge === 'Preparing' &&
    !fin.hidden && !fin.pending && a.length === 2 && a[1].presented === true,
    { older: brief(older), beforeConfirm: brief(beforeConfirm), pend: brief(pend), fin: brief(fin), asks: a.map(askBrief) });
}

// ---- S6: other outcomes while/after a pending card ---------------------------------------
{
  const p = setup(); p.setVersion(null);
  p.session.press('ASK'); p.markText('change of basis'); await tick();
  const s = p.snap(); const a = p.asks();
  check('S6.source_unregistered_replaces_pending', !s.hidden && !s.pending && !s.pendingClass && s.badge === 'Source not registered' && a.length === 1 && a[0].outcome === 'source_unregistered' && a[0].presented === true && p.session.state.mode === 'NAV',
    { card: brief(s), asks: a.map(askBrief) });
}
{
  const p = setup(); p.sel.rect = { x: 1200, y: 200, left: 1200, top: 200, right: 1500, bottom: 240, width: 300, height: 40 };
  p.session.press('ASK'); p.markText('change of basis'); await tick();
  const s = p.snap(); const a = p.asks();
  check('S6.empty_geometry_replaces_pending', !s.hidden && !s.pending && !s.pendingClass && s.badge === 'No selection' && a.length === 1 && a[0].outcome === 'empty_geometry' && a[0].presented === true,
    { card: brief(s), asks: a.map(askBrief), mode: p.session.state.mode });
}
{
  const g = digestGate(); const p = setup();
  p.session.press('ASK'); g.hold(true); p.markText('change of basis');
  const pend = p.snap();
  p.session.cancelAsk(); // user cancels while hashing
  g.hold(false); g.releaseAll(); await tick(); g.restore();
  const s = p.snap(); const a = p.asks();
  check('S6.not_in_ask_clears_pending', pend.pending && s.hidden && !s.pending && a.length === 1 && a[0].outcome === 'not_in_ask' && a[0].presented === false && p.session.explanationRequestCount === 0,
    { pend: brief(pend), card: brief(s), asks: a.map(askBrief) });
}
{
  // Internal failure after submit (digest rejects): pending card must not stay forever.
  const original = globalThis.crypto.subtle.digest;
  globalThis.crypto.subtle.digest = () => Promise.reject(new Error('synthetic digest failure'));
  const p = setup();
  p.session.press('ASK'); p.markText('change of basis');
  const pend = p.snap(); await tick();
  globalThis.crypto.subtle.digest = original;
  const s = p.snap(); const a = p.asks();
  check('S6.internal_error_clears_pending', pend.pending && s.hidden && !s.pending && a.length === 1 && a[0].presented === false,
    { pend: brief(pend), card: brief(s), asks: a.map((e) => ({ ...askBrief(e), error: e.detail.error })), modeAfter: p.session.state.mode });
}

// ---- S7: fullscreen while a request is pending --------------------------------------------
for (const kind of ['video', 'div']) {
  const d = deferred(); const p = setup({ transport: d.transport });
  p.session.press('ASK'); p.markText('eigenvector'); await tick();
  const pend = p.snap();
  const fsEl = kind === 'video' ? new globalThis.HTMLVideoElement('video') : new globalThis.HTMLElement('div');
  p.doc.fullscreenElement = fsEl; p.doc.fire('fullscreenchange');
  const inFs = p.snap();
  d.ack(0); await tick();
  const answered = p.snap(); const a = p.asks();
  const fsEvents = p.events.filter((e) => e.type === 'fullscreen').map((e) => e.overlay);
  p.doc.fullscreenElement = null; p.doc.fire('fullscreenchange');
  results[`S7.fullscreen_${kind}_while_pending_observed`] = { pend: brief(pend), inFs: brief(inFs), answered: brief(answered), overlayWhenAnswered: fsEvents.at(-1), asks: a.map(askBrief) };
  check(`S7.fullscreen_${kind}_pending_survives_and_answer_renders`, pend.pending && inFs.pending && !answered.hidden && a.length === 1 && a[0].presented === true, results[`S7.fullscreen_${kind}_while_pending_observed`]);
}
{
  const g = digestGate(); const p = setup();
  p.session.press('ASK'); g.hold(true); p.markText('eigenvector');
  const pend = p.snap();
  p.doc.fullscreenElement = new globalThis.HTMLVideoElement('video'); p.doc.fire('fullscreenchange');
  g.hold(false); g.releaseAll(); await tick(); g.restore();
  const s = p.snap(); const a = p.asks();
  check('S7.video_fullscreen_during_hashing_forces_nav_and_clears', pend.pending && s.hidden && !s.pending && a.length === 1 && a[0].outcome === 'not_in_ask' && a[0].presented === false, { pend: brief(pend), card: brief(s), asks: a.map(askBrief) });
}

// ---- S8: frame role evidence: presented flag vs what the top actually shows ---------------
{
  // Wire a real top probe and a real frame probe together through async postMessage doubles.
  const topWinRef = {}; const frameWinRef = {};
  const frameHandle = { postMessage: (data) => setTimeout(() => frameWinRef.w.fire('message', { source: parentProxy, origin: ORIGIN, data }), 0) };
  const parentProxy = { postMessage: (data, origin) => setTimeout(() => topWinRef.w.fire('message', { source: frameHandle, origin: ORIGIN, data }), 0) };
  const fd = deferred();
  const frame = setup({ role: 'frame', transport: fd.transport, parent: parentProxy });
  frameWinRef.w = frame.win;
  const top = setup();
  topWinRef.w = top.win;
  top.win.frames = [frameHandle];
  top.session.press('ASK'); await tick();
  const frameModeAfterTopAsk = frame.session.state.mode;
  frame.markText('change of basis'); await tick(); // frame request submitted, bridge pending
  const topModeWhileFramePending = top.session.state.mode;
  const topCardWhileFramePending = top.snap();
  top.session.cancelAsk(); await tick(); // user presses Cancel in the top toolbar (it still shows ASK)
  fd.ack(0); await tick(); await tick();
  const fa = frame.asks(); const topCard = top.snap();
  results['S8.frame_presented_flag_vs_top'] = {
    frameModeAfterTopAsk, topModeWhileFramePending, topCardWhileFramePending: brief(topCardWhileFramePending),
    frameAsks: fa.map(askBrief), topCard: brief(topCard),
    topRejected: top.events.filter((e) => e.type === 'message_rejected').map((e) => e.reason), topRelayed: top.events.filter((e) => e.type === 'card_relayed').length,
  };
  check('S8.frame_presented_true_only_if_top_renders', !(fa[0]?.presented === true && topCard.hidden), results['S8.frame_presented_flag_vs_top']);
}
{
  // Same wiring, positive control: no cancel, the top renders the relay.
  const topWinRef = {}; const frameWinRef = {};
  const frameHandle = { postMessage: (data) => setTimeout(() => frameWinRef.w.fire('message', { source: parentProxy, origin: ORIGIN, data }), 0) };
  const parentProxy = { postMessage: (data) => setTimeout(() => topWinRef.w.fire('message', { source: frameHandle, origin: ORIGIN, data }), 0) };
  const fd = deferred();
  const frame = setup({ role: 'frame', transport: fd.transport, parent: parentProxy });
  frameWinRef.w = frame.win;
  const top = setup(); topWinRef.w = top.win;
  top.win.frames = [frameHandle];
  top.session.press('ASK'); await tick();
  frame.markText('change of basis');
  const frameWhilePending = frame.snap(); await tick();
  const frameWhilePending2 = frame.snap();
  fd.ack(0); await tick(); await tick();
  const fa = frame.asks(); const topCard = top.snap();
  check('S8.frame_relay_positive_control', fa.length === 1 && fa[0].presented === true && !topCard.hidden && topCard.quote.includes('change of basis') && top.snap().pending === false && top.session.state.mode === 'NAV' &&
      frameWhilePending.hidden && frameWhilePending2.hidden && !frameWhilePending.pending,
    { frameAsks: fa.map(askBrief), topCard: brief(topCard), frameWhilePending: brief(frameWhilePending), frameWhilePending2: brief(frameWhilePending2), frameCardHiddenAtEnd: frame.snap().hidden });
}

const failed = checks.filter((c) => !c.ok).map((c) => c.name);
if (process.argv.includes('--json')) console.log(JSON.stringify({ kind: 'synthetic_DOM_and_event_doubles_not_browser', root: process.env.W1_ROOT ?? '/tmp/qa-71f/work/w1-dismissal', results }, null, 2));
console.log(`CHECKS ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) console.log('FAILED ' + failed.join(' '));
process.exitCode = failed.length ? 1 : 0;
