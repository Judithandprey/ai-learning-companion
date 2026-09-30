// The control window's capture-storage line (showLink in src/renderer/control.ts), run on its own with a fake page:
// off: nothing is shown and the header keeps saying nothing is sent; unavailable: the same header, the reason shown;
// development: the header says frames are also stored in a local test service, with counts and "AI: not connected";
// after a record-write fault the counts stay and the header says further sends have stopped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { appSource } from './source.ts';

const source = appSource('src/renderer/control.ts');
const showLink = source.slice(source.indexOf('const AI_DEFAULT'), source.indexOf('lc.onLink(showLink);'));
const HEADER = 'No AI is connected: captured frames and ink stay on this device, and nothing is sent anywhere.';
function page() {
  const nodes: Record<string, { textContent: string; hidden: boolean }> = { ai: { textContent: HEADER, hidden: false }, link: { textContent: '', hidden: true } };
  const ctx = { $: (id: string) => nodes[id]!, nodes };
  vm.createContext(ctx);
  vm.runInContext(`${stripTypeScriptTypes(showLink)}\nglobalThis.showLink = showLink;`, ctx);
  return ctx as typeof ctx & { showLink: (l: unknown) => void };
}

test('off: nothing is shown and the header still says nothing is sent', () => {
  const p = page();
  p.showLink({ mode: 'off' });
  assert.deepEqual([p.nodes['link']!.hidden, p.nodes['ai']!.textContent], [true, HEADER]);
});

test('unavailable: the reason is shown, and the header still says nothing is sent (storage cannot happen)', () => {
  const p = page();
  p.showLink({ mode: 'unavailable', reason: 'the development capture host configuration is not valid' });
  assert.equal(p.nodes['ai']!.textContent, HEADER);
  assert.equal(p.nodes['link']!.hidden, false);
  assert.match(p.nodes['link']!.textContent, /Capture storage \(development\): off\. the development capture host configuration is not valid\./);
});

test('development: the header says what is stored and that no AI is connected; the counts are said', () => {
  const p = page();
  p.showLink({ mode: 'development', state: 'sending', stored: 4, unknown: 2, refused: 0, not_sent: 1, detail: null, earlier_unknown: 1, sends_stopped: false });
  assert.match(p.nodes['ai']!.textContent, /Development mode: .* also stored in a local test capture service .* No AI is connected/);
  assert.equal(p.nodes['link']!.textContent, 'Capture storage (development): storing. 4 record(s) stored; 2 not known whether stored; 1 not sent (kept on this device); 1 earlier stream(s) whose end is not known. AI: not connected.');
});

test('after a record-write fault the earlier outcomes and the unconfirmed Stop stay shown: further sends stopped, never "nothing is sent anywhere"', () => {
  const p = page();
  p.showLink({ mode: 'development', state: 'sending', stored: 2, unknown: 0, refused: 0, not_sent: 0, detail: null, earlier_unknown: 0, sends_stopped: false });
  assert.match(p.nodes['ai']!.textContent, /Development mode/);
  const fault = 'the capture link record could not be written, so further sends to the local test capture service have stopped';
  p.showLink({ mode: 'development', state: 'stopped', stored: 2, unknown: 1, refused: 0, not_sent: 0, detail: `${fault}; the Stop is not confirmed`, earlier_unknown: 1, sends_stopped: true });
  assert.equal(p.nodes['ai']!.textContent, 'Development mode: captured frames and ink are kept on this device. Further sends to the local test capture service on it have stopped; what was sent before is counted below. No AI is connected; nothing is sent to any AI.');
  assert.equal(p.nodes['link']!.textContent, `Capture storage (development): stopped. 2 record(s) stored; 1 not known whether stored; 1 earlier stream(s) whose end is not known. ${fault}; the Stop is not confirmed. AI: not connected.`);
  assert.doesNotMatch(p.nodes['ai']!.textContent, /nothing is sent anywhere/);
  // Off again (the configuration removed): the default header.
  p.showLink({ mode: 'off' });
  assert.equal(p.nodes['ai']!.textContent, HEADER);
});
