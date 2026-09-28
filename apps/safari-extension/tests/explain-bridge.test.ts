import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExplanationRequest, cardView, normalizeSelectedText, PROVIDER_UNAVAILABLE_TEXT, quoteOf, resolveProbeCard } from '../src/explain.ts';
import { buildBridgeRequest, parseBridgeResponse, submitSelection, unavailableTransport, type NativeTransport } from '../src/bridge.ts';
import { FIXTURE_EXPLANATIONS } from '../src/fixture-data.ts';
import type { Selection } from '../src/contracts.ts';

function selection(overrides: Partial<Selection> = {}): Selection {
  return {
    user_id: 'synthetic-web-probe-user',
    source_id: 'web-probe-fixture',
    source_version: 1,
    id: 'sel-1',
    session_id: 'synthetic-web-probe-session',
    device_id: 'synthetic-web-probe-device',
    frame_id: 'frm-1',
    media_position: null,
    bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
    selected_text: 'change of basis',
    concept_candidates: [],
    input_mode: 'pencil_ask',
    created_at: '2026-09-28T12:00:00.000Z',
    ...overrides,
  };
}

const card = (sel: Selection) => resolveProbeCard(buildExplanationRequest(sel, 'req-1', null, 1), sel, FIXTURE_EXPLANATIONS);

test('only the exact fixture (source, version, text) gets a labeled fixture card', () => {
  const ready = card(selection());
  assert.equal(ready.status, 'ready');
  assert.equal(ready.provenance, 'fixture');
  assert.equal(ready.audio, false);
  assert.equal(ready.cache_hit, false);
  assert.deepEqual(ready.source_refs, [{ user_id: 'synthetic-web-probe-user', source_id: 'web-probe-fixture', source_version: 1 }]);
  assert.match(cardView(ready, selection()).badge, /Fixture card/);
  assert.equal(card(selection({ selected_text: '  change\n of   basis ' })).status, 'ready');
});

test('arbitrary text, other versions and other sources show provider unavailable, never an explanation', () => {
  for (const sel of [
    selection({ selected_text: 'change of basis matrix' }),
    selection({ selected_text: 'Change of basis' }),
    selection({ source_version: 2 }),
    selection({ source_id: 'other-source' }),
    selection({ selected_text: '' }),
  ]) {
    const c = card(sel);
    assert.equal(c.status, 'unsupported');
    assert.equal(c.provenance, 'none');
    assert.equal(c.text, PROVIDER_UNAVAILABLE_TEXT);
    assert.deepEqual(c.source_refs, []);
    assert.equal(c.audio, false);
    assert.equal(cardView(c, sel).badge, 'Provider unavailable');
  }
});

test('explanation requests are silent and bound to the selection', () => {
  const req = buildExplanationRequest(selection(), 'req-9', 'project-1', 3);
  assert.deepEqual(req, { user_id: 'synthetic-web-probe-user', request_id: 'req-9', selection_id: 'sel-1', project_id: 'project-1', knowledge_profile_version: 3, mode: 'silent' });
  assert.throws(() => resolveProbeCard(req, selection({ id: 'sel-other' }), FIXTURE_EXPLANATIONS), /does not belong/);
});

test('card view quotes markup-like selections as literal text', () => {
  const sel = selection({ selected_text: '<img src=x onerror=alert(1)>' });
  const view = cardView(card(sel), sel);
  assert.equal(view.body, PROVIDER_UNAVAILABLE_TEXT);
  assert.equal(view.quote, 'Selected: “<img src=x onerror=alert(1)>”');
  assert.equal(normalizeSelectedText('<b> x </b>'), '<b> x </b>');
  assert.equal(quoteOf(''), 'Selected region (no page text)');
  assert.equal(quoteOf('x'.repeat(200)).length, 'Selected: “”…'.length + 160);
});

test('bridge request carries exactly the contract fields', () => {
  const polluted = { ...selection(), cookie: 'session=secret', page_url: 'https://example.invalid/?token=1', authorization: 'Bearer x' } as Selection;
  const req = buildBridgeRequest(polluted, 'brq-1');
  assert.deepEqual(Object.keys(req).sort(), ['action', 'contract_version', 'request_id', 'selection']);
  assert.equal(req.action, 'selection.submit');
  assert.equal(req.contract_version, '0.1.0');
  const json = JSON.stringify(req);
  assert.doesNotMatch(json, /secret|token|Bearer|page_url|cookie|authorization/);
  assert.deepEqual(Object.keys(req.selection).sort(), Object.keys(selection()).sort());
});

test('bridge responses are parsed strictly', () => {
  assert.deepEqual(parseBridgeResponse({ contract_version: '0.1.0', request_id: 'brq-1', status: 'accepted', error_code: null }, 'brq-1'), {
    contract_version: '0.1.0',
    request_id: 'brq-1',
    status: 'accepted',
    error_code: null,
  });
  const bad = [
    null,
    [],
    { contract_version: '0.1.0', request_id: 'brq-2', status: 'accepted', error_code: null },
    { contract_version: '0.2.0', request_id: 'brq-1', status: 'accepted', error_code: null },
    { contract_version: '0.1.0', request_id: 'brq-1', status: 'saved', error_code: null },
    { contract_version: '0.1.0', request_id: 'brq-1', status: 'accepted', error_code: 'stale_source' },
    { contract_version: '0.1.0', request_id: 'brq-1', status: 'rejected', error_code: 'nope' },
    { contract_version: '0.1.0', request_id: 'brq-1', status: 'accepted', error_code: null, token: 'long-lived' },
  ];
  for (const raw of bad) assert.equal(parseBridgeResponse(raw, 'brq-1'), null, JSON.stringify(raw));
});

test('without a native bridge the outcome is a local bridge_unavailable, not acceptance', async () => {
  const req = buildBridgeRequest(selection(), 'brq-1');
  const out = await submitSelection(unavailableTransport, req);
  assert.equal(out.answeredBy, 'local');
  assert.equal(out.response.status, 'unsupported');
  assert.equal(out.response.error_code, 'bridge_unavailable');

  const throwing: NativeTransport = { kind: 'native', send: async () => { throw new Error('disconnected'); } };
  assert.equal((await submitSelection(throwing, req)).response.error_code, 'bridge_unavailable');

  const malformed: NativeTransport = { kind: 'native', send: async () => ({ ok: true }) };
  const m = await submitSelection(malformed, req);
  assert.equal(m.answeredBy, 'local');
  assert.equal(m.response.status, 'rejected');

  let sent: unknown = null;
  const native: NativeTransport = {
    kind: 'native',
    send: async (r) => {
      sent = r;
      return { contract_version: '0.1.0', request_id: r.request_id, status: 'needs_auth', error_code: null };
    },
  };
  const n = await submitSelection(native, req);
  assert.equal(n.answeredBy, 'native');
  assert.equal(n.response.status, 'needs_auth');
  assert.equal(sent, req);
});
