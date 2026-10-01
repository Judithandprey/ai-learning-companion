// The control window's capture-storage line (showLink in src/renderer/control.ts), run on its own with a fake page:
// off: nothing is shown and the header keeps saying nothing is sent; unavailable: the same header, the reason shown;
// development: with a live stream the header says frames are also sent to a local test service and count as stored
// only once it confirms them (a send out is said as waiting, never as stored or not stored); after an unconfirmed send
// that storage is not confirmed; with no live stream that the service is not storing them now; always with counts and
// "AI: not connected". After a record-write fault the counts stay and the header says further sends have stopped.
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

const LIVE = 'Development mode: captured frames and ink are kept on this device and are also sent to a local test capture service on it. A record counts as stored only once that service confirms it; the counts are below. No AI is connected; nothing is sent to any AI.';
const UNCONFIRMED = 'Development mode: captured frames and ink are kept on this device. Whether a local test capture service on it is storing them now is not confirmed; its state, and the latest capture\'s counts, are below. No AI is connected; nothing is sent to any AI.';
const NOT_STORING = 'Development mode: captured frames and ink are kept on this device. A local test capture service on it is not storing them now; its state, and the latest capture\'s counts, are below. No AI is connected; nothing is sent to any AI.';
/** Any text saying, as a fact, that frames are (being) stored. */
const CLAIMS = /(are|is) (also )?(being )?stored|also (being )?stored in/;
const status = (o: object) => ({ mode: 'development', state: 'sending', stored: 0, unknown: 0, refused: 0, not_sent: 0, detail: null, earlier_unknown: 0, sends_stopped: false, awaiting: false, storing: false, ...o });

test('development, live: the header says frames are also sent and count as stored only once confirmed; the line says what is confirmed', () => {
  const p = page();
  p.showLink(status({ stored: 4, unknown: 2, not_sent: 1, earlier_unknown: 1, storing: true }));
  assert.equal(p.nodes['ai']!.textContent, LIVE);
  assert.equal(p.nodes['link']!.textContent, 'Capture storage (development): connected: frames are sent as they are kept. 4 record(s) stored; 2 not known whether stored; 1 not sent (kept on this device); 1 earlier stream(s) whose end is not known. AI: not connected.');
  assert.doesNotMatch(`${p.nodes['ai']!.textContent} ${p.nodes['link']!.textContent}`, CLAIMS);
});

// QA-WIN-05.
test('development, a send out and not yet answered: said as waiting for confirmation, apart from what is confirmed; never as stored, never as not stored', () => {
  const p = page();
  p.showLink(status({ stored: 3, unknown: 1, awaiting: true }));
  assert.equal(p.nodes['ai']!.textContent, LIVE, 'the same header as when nothing is out: it never said frames are being stored');
  assert.equal(p.nodes['link']!.textContent, 'Capture storage (development): sending: waiting for the service to confirm. 3 record(s) stored; 1 not known whether stored. AI: not connected.');
  assert.doesNotMatch(`${p.nodes['ai']!.textContent} ${p.nodes['link']!.textContent}`, CLAIMS);
  assert.doesNotMatch(`${p.nodes['ai']!.textContent} ${p.nodes['link']!.textContent}`, /not stored|not storing/);
  // A retry out while storage is not confirmed: still "not confirmed", never "not stored".
  p.showLink(status({ state: 'stalled', stored: 3, unknown: 1, awaiting: true, detail: 'storage of the last send is not confirmed (no answer, or the service said to send it again later); the same record(s) are tried again' }));
  assert.equal(p.nodes['ai']!.textContent, UNCONFIRMED);
  assert.equal(p.nodes['link']!.textContent, 'Capture storage (development): storage not confirmed now (the frames are kept on this device). 3 record(s) stored; 1 not known whether stored. storage of the last send is not confirmed (no answer, or the service said to send it again later); the same record(s) are tried again. AI: not connected.');
  assert.doesNotMatch(`${p.nodes['ai']!.textContent} ${p.nodes['link']!.textContent}`, /(was|were|is|are) not stored|not storing/);
});

test('development, no live stream (idle, connecting, not connected, offline, stopping, stopped, ended by the service): the header says the service is not storing now', () => {
  for (const state of ['idle', 'connecting', 'not connected', 'offline', 'stopping', 'stopped', 'ended by the service', 'reconciling']) {
    const p = page();
    p.showLink(status({ state, stored: state === 'stopped' ? 3 : 0 }));
    assert.equal(p.nodes['ai']!.textContent, NOT_STORING, state);
    assert.doesNotMatch(p.nodes['ai']!.textContent, CLAIMS, state);
  }
  // A send still out when the stream is no longer live (a Stop, a lost host) may yet be confirmed: "not confirmed",
  // never "not storing".
  for (const state of ['stopping', 'offline', 'connecting', 'not connected']) {
    const p = page();
    p.showLink(status({ state, stored: 2, unknown: 2, awaiting: true }));
    assert.equal(p.nodes['ai']!.textContent, UNCONFIRMED, state);
  }
  const stopping = page();
  stopping.showLink(status({ state: 'stopping', stored: 2, unknown: 2, awaiting: true }));
  assert.equal(stopping.nodes['link']!.textContent, 'Capture storage (development): stopping: nothing new is sent; the last send is waiting for the service to confirm. 2 record(s) stored; 2 not known whether stored. AI: not connected.');
  // The line names each state without promising a connection or that frames will never be stored.
  const line = (state: string): string => {
    const p = page();
    p.showLink(status({ state }));
    return p.nodes['link']!.textContent;
  };
  assert.equal(line('idle'), 'Capture storage (development): not connected yet (a connection is tried when you press Start). 0 record(s) stored. AI: not connected.');
  assert.equal(line('stalled'), 'Capture storage (development): storage not confirmed now (the frames are kept on this device). 0 record(s) stored. AI: not connected.');
  assert.equal(line('offline'), 'Capture storage (development): offline (the frames are kept on this device). 0 record(s) stored. AI: not connected.');
});

test('after a record-write fault the earlier outcomes and the unconfirmed Stop stay shown: further sends stopped, never "nothing is sent anywhere"', () => {
  const p = page();
  p.showLink(status({ stored: 2, storing: true }));
  assert.match(p.nodes['ai']!.textContent, /Development mode/);
  const fault = 'the capture link record could not be written, so further sends to the local test capture service have stopped';
  p.showLink(status({ state: 'stopped', stored: 2, unknown: 1, detail: `${fault}; the Stop is not confirmed`, earlier_unknown: 1, sends_stopped: true }));
  assert.equal(p.nodes['ai']!.textContent, 'Development mode: captured frames and ink are kept on this device. Further sends to the local test capture service on it have stopped; what the latest capture sent before is counted below. No AI is connected; nothing is sent to any AI.');
  assert.equal(p.nodes['link']!.textContent, `Capture storage (development): stopped. 2 record(s) stored; 1 not known whether stored; 1 earlier stream(s) whose end is not known. ${fault}; the Stop is not confirmed. AI: not connected.`);
  assert.doesNotMatch(p.nodes['ai']!.textContent, /nothing is sent anywhere/);
  // Off again (the configuration removed): the default header.
  p.showLink({ mode: 'off' });
  assert.equal(p.nodes['ai']!.textContent, HEADER);
});
