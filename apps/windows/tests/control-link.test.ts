// The control window's capture-storage line (showLink in src/renderer/control.ts), run on its own with a fake page:
// off: nothing is shown and the header keeps saying nothing is sent; unavailable: the same header, the reason shown;
// development: the header says frames are also being stored in a local test service only while they are (else that
// the service is not storing them now), with counts and "AI: not connected"; after a record-write fault the counts
// stay and the header says further sends have stopped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlPage as page, HEADER } from './control-page.ts';

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

test('development, storing now: the header says frames are also being stored and that no AI is connected; the counts are said', () => {
  const p = page();
  p.showLink({ mode: 'development', state: 'sending', stored: 4, unknown: 2, refused: 0, not_sent: 1, detail: null, earlier_unknown: 1, sends_stopped: false, storing: true });
  assert.equal(p.nodes['ai']!.textContent, 'Development mode: captured frames and ink are kept on this device and are also being stored in a local test capture service on it; the counts are below. No AI is connected; nothing is sent to any AI.');
  assert.equal(p.nodes['link']!.textContent, 'Capture storage (development): storing. 4 record(s) stored; 2 not known whether stored; 1 not sent (kept on this device); 1 earlier stream(s) whose end is not known. AI: not connected.');
});

test('development, not storing now (idle, connecting, a send not answered, not connected, offline, stopping, stopped, ended by the service): the header never says frames are stored', () => {
  for (const state of ['idle', 'connecting', 'stalled', 'not connected', 'offline', 'stopping', 'stopped', 'ended by the service', 'reconciling']) {
    const p = page();
    p.showLink({ mode: 'development', state, stored: state === 'stopped' ? 3 : 0, unknown: 0, refused: 0, not_sent: 0, detail: null, earlier_unknown: 0, sends_stopped: false, storing: false });
    assert.equal(p.nodes['ai']!.textContent, 'Development mode: captured frames and ink are kept on this device. A local test capture service on it is not storing them now; its state, and the latest capture\'s counts, are below. No AI is connected; nothing is sent to any AI.', state);
    assert.doesNotMatch(p.nodes['ai']!.textContent, /also (being )?stored/, state);
  }
  // The line names each state without promising a connection or that frames will never be stored.
  const line = (state: string): string => {
    const p = page();
    p.showLink({ mode: 'development', state, stored: 0, unknown: 0, refused: 0, not_sent: 0, detail: null, earlier_unknown: 0, sends_stopped: false, storing: false });
    return p.nodes['link']!.textContent;
  };
  assert.equal(line('idle'), 'Capture storage (development): not connected yet (a connection is tried when you press Start). 0 record(s) stored. AI: not connected.');
  assert.equal(line('stalled'), 'Capture storage (development): not storing now: trying again (the frames are kept on this device). 0 record(s) stored. AI: not connected.');
  assert.equal(line('offline'), 'Capture storage (development): offline (the frames are kept on this device). 0 record(s) stored. AI: not connected.');
});

test('after a record-write fault the earlier outcomes and the unconfirmed Stop stay shown: further sends stopped, never "nothing is sent anywhere"', () => {
  const p = page();
  p.showLink({ mode: 'development', state: 'sending', stored: 2, unknown: 0, refused: 0, not_sent: 0, detail: null, earlier_unknown: 0, sends_stopped: false, storing: true });
  assert.match(p.nodes['ai']!.textContent, /Development mode/);
  const fault = 'the capture link record could not be written, so further sends to the local test capture service have stopped';
  p.showLink({ mode: 'development', state: 'stopped', stored: 2, unknown: 1, refused: 0, not_sent: 0, detail: `${fault}; the Stop is not confirmed`, earlier_unknown: 1, sends_stopped: true, storing: false });
  assert.equal(p.nodes['ai']!.textContent, 'Development mode: captured frames and ink are kept on this device. Further sends to the local test capture service on it have stopped; what the latest capture sent before is counted below. No AI is connected; nothing is sent to any AI.');
  assert.equal(p.nodes['link']!.textContent, `Capture storage (development): stopped. 2 record(s) stored; 1 not known whether stored; 1 earlier stream(s) whose end is not known. ${fault}; the Stop is not confirmed. AI: not connected.`);
  assert.doesNotMatch(p.nodes['ai']!.textContent, /nothing is sent anywhere/);
  // Off again (the configuration removed): the default header.
  p.showLink({ mode: 'off' });
  assert.equal(p.nodes['ai']!.textContent, HEADER);
});
