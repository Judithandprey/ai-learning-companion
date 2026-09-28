import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideInput, pointerKindOf, selectionInputMode, type PointerKind } from '../src/input-policy.ts';
import { ProbeSession } from '../src/session.ts';
import { unavailableTransport } from '../src/bridge.ts';
import { FIXTURE_EXPLANATIONS, SYNTHETIC_IDENTITY, resolveFixtureSource } from '../src/fixture-data.ts';
import type { Mode } from '../src/mode.ts';
import { counterIds, fixedClock, snapshot } from './helpers.ts';

function session(): ProbeSession {
  return new ProbeSession({
    identity: SYNTHETIC_IDENTITY,
    ids: counterIds(),
    clock: fixedClock(),
    transport: unavailableTransport,
    fixtures: FIXTURE_EXPLANATIONS,
    resolveSource: resolveFixtureSource,
    projectId: null,
    knowledgeProfileVersion: 1,
  });
}

test('decision table', () => {
  const rows: Array<[Mode, PointerKind, boolean, string]> = [
    ['NAV', 'pen', true, 'pass_through'],
    ['NAV', 'touch', false, 'pass_through'],
    ['NAV', 'mouse', false, 'pass_through'],
    ['WRITE', 'pen', true, 'ink_capture'],
    ['WRITE', 'touch', true, 'pass_through'],
    ['WRITE', 'touch', false, 'pass_through'],
    ['WRITE', 'mouse', false, 'pass_through'],
    ['ASK', 'pen', true, 'ask_capture'],
    ['ASK', 'touch', true, 'pass_through'],
    ['ASK', 'touch', false, 'ask_capture'],
    ['ASK', 'mouse', false, 'ask_observe_text'],
    ['ASK', 'unknown', false, 'pass_through'],
  ];
  for (const [mode, pointer, penObserved, expected] of rows) {
    assert.equal(decideInput({ mode, pointer, penObserved, target: 'page' }), expected, `${mode}/${pointer}/${penObserved}`);
  }
  for (const mode of ['NAV', 'ASK', 'WRITE'] as const) {
    for (const pointer of ['pen', 'touch', 'mouse'] as const) {
      assert.equal(decideInput({ mode, pointer, penObserved: false, target: 'own_ui' }), 'pass_through');
    }
  }
});

test('pointer kinds and input modes', () => {
  assert.equal(pointerKindOf('pen'), 'pen');
  assert.equal(pointerKindOf(''), 'unknown');
  assert.equal(selectionInputMode('pen', 'ask_capture'), 'pencil_ask');
  assert.equal(selectionInputMode('touch', 'ask_capture'), 'explicit_touch_ask');
  assert.equal(selectionInputMode('mouse', 'ask_observe_text'), 'explicit_text_ask');
  assert.equal(selectionInputMode('touch', 'pass_through'), null);
});

test('a pen observed once keeps fingers navigating in ASK', () => {
  const s = session();
  s.press('ASK');
  assert.equal(s.classify('touch', 'page'), 'ask_capture');
  assert.equal(s.classify('pen', 'page'), 'ask_capture');
  assert.equal(s.classify('touch', 'page'), 'pass_through');
});

// §11 input false-trigger check: a fixed script of 100 ordinary gestures.
type Gesture = { name: string; mode: 'NAV' | 'WRITE'; pointers: PointerKind[]; penObserved: boolean };

function scriptedGestures(): Gesture[] {
  const kinds: Array<[string, PointerKind[]]> = [
    ['scroll-drag', ['touch']],
    ['tap-link', ['touch']],
    ['pinch-zoom', ['touch', 'touch']],
    ['scrub-progress', ['touch']],
    ['click-button', ['mouse']],
    ['mouse-text-select', ['mouse']],
    ['wheel-scroll', ['mouse']],
    ['scrub-progress-mouse', ['mouse']],
    ['pen-tap', ['pen']],
    ['pen-stroke', ['pen']],
  ];
  const out: Gesture[] = [];
  for (let i = 0; out.length < 100; i++) {
    const [name, pointers] = kinds[i % kinds.length]!;
    out.push({ name: `${name}#${i}`, mode: i % 2 === 0 ? 'NAV' : 'WRITE', pointers, penObserved: i % 3 === 0 });
  }
  return out;
}

test('100 scripted ordinary gestures in NAV/WRITE never request an explanation', async () => {
  const gestures = scriptedGestures();
  assert.equal(gestures.length, 100);
  const s = session();
  let inkStrokes = 0;
  for (const g of gestures) {
    s.press(g.mode);
    if (g.penObserved) s.classify('pen', 'own_ui');
    for (const p of g.pointers) {
      const d = s.classify(p, 'page');
      assert.ok(d === 'pass_through' || d === 'ink_capture', `${g.name}: ${d}`);
      if (d === 'ink_capture') {
        assert.equal(g.mode, 'WRITE');
        assert.equal(p, 'pen');
        inkStrokes++;
      }
    }
    // Even a forged capture for the current epoch is refused outside ASK.
    const outcome = await s.submitAsk({ askEpoch: s.state.askEpoch, inputMode: 'pencil_ask', rect: { x: 1, y: 1, width: 10, height: 10 }, snapshot: snapshot() });
    assert.equal(outcome.status, 'not_in_ask', g.name);
  }
  assert.equal(s.explanationRequestCount, 0);
  assert.ok(inkStrokes > 0);
});
