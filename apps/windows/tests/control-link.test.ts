// The control window's capture-storage line (showLink in src/renderer/control.ts), run on its own with a fake page:
// off: nothing is shown and the header keeps saying nothing is sent; unavailable: the same header, the reason shown;
// development: the header says frames are also stored in a local test service, with counts and "AI: not connected".
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
  p.showLink({ mode: 'development', state: 'sending', stored: 4, unknown: 2, refused: 0, not_sent: 1, detail: null, earlier_unknown: 1 });
  assert.match(p.nodes['ai']!.textContent, /Development mode: .* also stored in a local test capture service .* No AI is connected/);
  assert.equal(p.nodes['link']!.textContent, 'Capture storage (development): storing. 4 record(s) stored; 2 not known whether stored; 1 not sent (kept on this device); 1 earlier stream(s) whose end is not known. AI: not connected.');
});

test('from development to unavailable (a record that cannot be written): the header no longer claims storage', () => {
  const p = page();
  p.showLink({ mode: 'development', state: 'sending', stored: 2, unknown: 0, refused: 0, not_sent: 0, detail: null, earlier_unknown: 0 });
  assert.match(p.nodes['ai']!.textContent, /Development mode/);
  p.showLink({ mode: 'unavailable', reason: 'the capture link record could not be written, so nothing more is sent' });
  assert.equal(p.nodes['ai']!.textContent, HEADER);
  p.showLink({ mode: 'off' });
  assert.equal(p.nodes['ai']!.textContent, HEADER);
});
