// Does a frame render a card of its own? (doc: "Frames render no cards of their own")
import { setup, tick, brief, askBrief } from './harness.mjs';
const out = {};
for (const kind of ['source_unregistered', 'empty_geometry']) {
  const posted = [];
  const frame = setup({ role: 'frame', parent: { postMessage: (d) => posted.push(d.type) } });
  if (kind === 'source_unregistered') frame.setVersion(null);
  else frame.sel.rect = { x: 1200, y: 200, left: 1200, top: 200, right: 1500, bottom: 240, width: 300, height: 40 };
  frame.session.press('ASK'); frame.markText('change of basis'); await tick();
  out[kind] = { frameCard: brief(frame.snap()), asks: frame.asks().map(askBrief), postedToParent: posted };
}
console.log(JSON.stringify(out, null, 1));
