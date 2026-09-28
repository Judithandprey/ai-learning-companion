// S8b observation: frame request in flight (top toolbar still ASK, no top pending card); user marks again in the top.
import { setup, deferred, tick, brief, askBrief, ORIGIN } from './harness.mjs';
const topWinRef = {}; const frameWinRef = {};
const frameHandle = { postMessage: (data) => setTimeout(() => frameWinRef.w.fire('message', { source: parentProxy, origin: ORIGIN, data }), 0) };
const parentProxy = { postMessage: (data) => setTimeout(() => topWinRef.w.fire('message', { source: frameHandle, origin: ORIGIN, data }), 0) };
const fd = deferred(); const td = deferred();
const frame = setup({ role: 'frame', transport: fd.transport, parent: parentProxy }); frameWinRef.w = frame.win;
const top = setup({ transport: td.transport }); topWinRef.w = top.win; top.win.frames = [frameHandle];
top.session.press('ASK'); await tick();
frame.markText('change of basis'); await tick();
const whileFramePending = { topMode: top.session.state.mode, frameMode: frame.session.state.mode, topCard: brief(top.snap()), frameCard: brief(frame.snap()) };
top.markText('eigenvector'); await tick(); // top still shows ASK: the user marks again in the top page
const afterTopMark = { topMode: top.session.state.mode, topCard: brief(top.snap()) };
fd.ack(0); await tick(); await tick();
td.ack(0); await tick();
console.log(JSON.stringify({ kind: 'synthetic_DOM_doubles_not_browser', whileFramePending, afterTopMark,
  frameAsks: frame.asks().map(askBrief), topAsks: top.asks().map(askBrief), topCard: brief(top.snap()),
  topRejected: top.events.filter((e) => e.type === 'message_rejected').map((e) => e.reason) }, null, 1));
