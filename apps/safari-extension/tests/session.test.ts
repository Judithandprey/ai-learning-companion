import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProbeSession, type AskCapture } from '../src/session.ts';
import { unavailableTransport, type NativeTransport } from '../src/bridge.ts';
import { FIXTURE_EXPLANATIONS, SYNTHETIC_IDENTITY, resolveFixtureSource } from '../src/fixture-data.ts';
import { PROVIDER_UNAVAILABLE_TEXT } from '../src/explain.ts';
import { selectionProblems } from '../src/anchor.ts';
import { counterIds, fixedClock, snapshot } from './helpers.ts';

function session(transport: NativeTransport = unavailableTransport): ProbeSession {
  return new ProbeSession({
    identity: SYNTHETIC_IDENTITY,
    ids: counterIds(),
    clock: fixedClock(),
    transport,
    fixtures: FIXTURE_EXPLANATIONS,
    resolveSource: resolveFixtureSource,
    projectId: null,
    knowledgeProfileVersion: 1,
  });
}

function capture(s: ProbeSession, overrides: Partial<AskCapture> = {}): AskCapture {
  return { askEpoch: s.state.askEpoch, inputMode: 'pencil_ask', rect: { x: 100, y: 200, width: 300, height: 40 }, snapshot: snapshot(), ...overrides };
}

test('fixture selection: frozen anchor, labeled fixture card, prior mode restored', async () => {
  const s = session();
  s.press('WRITE');
  s.press('ASK');
  const out = await s.submitAsk(capture(s));
  assert.equal(out.status, 'submitted');
  if (out.status !== 'submitted') return;
  assert.equal(s.state.mode, 'WRITE');
  assert.equal(s.explanationRequestCount, 1);
  assert.equal(out.card.status, 'ready');
  assert.equal(out.card.provenance, 'fixture');
  assert.equal(out.card.audio, false);
  assert.equal(out.request.mode, 'silent');
  assert.equal(out.selection.frame_id, out.frozen.frame.frame_id);
  assert.deepEqual(out.selection.bbox, { x: 0.1, y: 0.25, width: 0.3, height: 0.05 });
  assert.deepEqual(selectionProblems(out.selection, out.frozen.frame), []);
  assert.equal(out.frozen.frame.representation, 'dom_snapshot');
  assert.equal(out.bridge.answeredBy, 'local');
  assert.equal(out.bridge.response.error_code, 'bridge_unavailable');
  assert.equal(out.bridgeRequest.selection.id, out.selection.id);
});

test('arbitrary text on the fixture page shows provider unavailable', async () => {
  const s = session();
  s.press('ASK');
  const out = await s.submitAsk(capture(s, { snapshot: snapshot({ text: 'underlying vector' }) }));
  assert.equal(out.status, 'submitted');
  if (out.status !== 'submitted') return;
  assert.equal(out.card.status, 'unsupported');
  assert.equal(out.card.text, PROVIDER_UNAVAILABLE_TEXT);
  assert.equal(s.state.mode, 'NAV');
});

test('lasso selections keep the polygon inside the bbox', async () => {
  const s = session();
  s.press('ASK');
  const polygon = [{ x: 100, y: 100 }, { x: 400, y: 120 }, { x: 380, y: 300 }, { x: 120, y: 280 }];
  const out = await s.submitAsk(capture(s, { polygon, rect: { x: 100, y: 100, width: 300, height: 200 }, snapshot: snapshot({ text: '' }) }));
  assert.equal(out.status, 'submitted');
  if (out.status !== 'submitted') return;
  assert.equal(out.selection.polygon?.length, 4);
  assert.deepEqual(selectionProblems(out.selection, out.frozen.frame), []);
  assert.equal(out.card.provenance, 'none');
});

test('unregistered pages end the ASK without a selection or request', async () => {
  const s = session();
  s.press('ASK');
  const out = await s.submitAsk(capture(s, { snapshot: snapshot({ origin: 'https://course.example.invalid' }) }));
  assert.equal(out.status, 'source_unregistered');
  assert.equal(s.state.mode, 'NAV');
  assert.equal(s.explanationRequestCount, 0);
});

test('empty geometry keeps the user in ASK to retry or cancel', async () => {
  const s = session();
  s.press('ASK');
  const out = await s.submitAsk(capture(s, { rect: { x: 2000, y: 0, width: 5, height: 5 } }));
  assert.equal(out.status, 'empty_geometry');
  assert.equal(s.state.mode, 'ASK');
  s.cancelAsk();
  assert.equal(s.state.mode, 'NAV');
});

test('cancelling while the frame is being hashed drops the capture', async () => {
  const s = session();
  s.press('ASK');
  const pending = s.submitAsk(capture(s));
  s.cancelAsk();
  const out = await pending;
  assert.equal(out.status, 'not_in_ask');
  assert.equal(s.explanationRequestCount, 0);
  assert.equal(s.state.mode, 'NAV');
});

test('a capture from an earlier ASK cannot land in a later one', async () => {
  const s = session();
  s.press('ASK');
  const stale = capture(s);
  s.press('ASK'); // cancel
  s.press('ASK'); // new ASK
  assert.equal((await s.submitAsk(stale)).status, 'not_in_ask');
  assert.equal(s.state.mode, 'ASK');
});

test('listeners see every mode change', () => {
  const s = session();
  const seen: string[] = [];
  const off = s.subscribe((st) => seen.push(st.mode));
  s.press('ASK');
  s.cancelAsk();
  s.press('WRITE');
  off();
  s.press('NAV');
  assert.deepEqual(seen, ['ASK', 'NAV', 'WRITE']);
});
