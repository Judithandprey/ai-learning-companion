import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_MODE_STATE, mayRequestExplanation, reduceMode, type Mode, type ModeAction, type ModeState } from '../src/mode.ts';

const press = (mode: Mode): ModeAction => ({ type: 'press', mode });
const run = (actions: ModeAction[], from: ModeState = INITIAL_MODE_STATE): ModeState =>
  actions.reduce((s, a) => reduceMode(s, a).state, from);

test('NAV is the default and never allows explanations', () => {
  assert.equal(INITIAL_MODE_STATE.mode, 'NAV');
  assert.equal(mayRequestExplanation(INITIAL_MODE_STATE, 0), false);
});

test('finished ASK restores NAV; cancelled ASK restores WRITE', () => {
  const asking = run([press('ASK')]);
  assert.equal(asking.mode, 'ASK');
  assert.equal(asking.returnMode, 'NAV');
  const done = reduceMode(asking, { type: 'ask_finished', askEpoch: asking.askEpoch });
  assert.equal(done.state.mode, 'NAV');
  assert.equal(done.askEnded, 'finished');

  const fromWrite = run([press('WRITE'), press('ASK')]);
  assert.equal(fromWrite.returnMode, 'WRITE');
  const cancelled = reduceMode(fromWrite, { type: 'ask_cancelled' });
  assert.equal(cancelled.state.mode, 'WRITE');
  assert.equal(cancelled.askEnded, 'cancelled');
});

test('pressing ASK while asking cancels instead of nesting', () => {
  const s = run([press('WRITE'), press('ASK'), press('ASK')]);
  assert.equal(s.mode, 'WRITE');
});

test('explicit NAV/WRITE during ASK ends it as cancelled', () => {
  const asking = run([press('ASK')]);
  const t = reduceMode(asking, press('WRITE'));
  assert.equal(t.state.mode, 'WRITE');
  assert.equal(t.askEnded, 'cancelled');
});

test('a finish from an earlier ASK epoch is ignored', () => {
  const first = run([press('ASK')]);
  const second = run([press('ASK'), press('ASK')], first); // cancel, then a new ASK
  assert.equal(second.mode, 'ASK');
  assert.notEqual(second.askEpoch, first.askEpoch);
  const t = reduceMode(second, { type: 'ask_finished', askEpoch: first.askEpoch });
  assert.equal(t.state.mode, 'ASK');
  assert.equal(t.askEnded, null);
  assert.equal(mayRequestExplanation(second, first.askEpoch), false);
  assert.equal(mayRequestExplanation(second, second.askEpoch), true);
});

test('WRITE persists until the user switches', () => {
  const s = run([press('WRITE'), { type: 'ask_cancelled' }, { type: 'ask_finished', askEpoch: 0 }, press('WRITE')]);
  assert.equal(s.mode, 'WRITE');
});

test('exhaustive sequences keep the restore invariant', () => {
  const actions: ModeAction[] = [press('NAV'), press('ASK'), press('WRITE'), { type: 'ask_cancelled' }, { type: 'ask_finished', askEpoch: 1 }];
  let checked = 0;
  const walk = (state: ModeState, depth: number, beforeAsk: Mode | null): void => {
    if (depth === 0) return;
    for (const a of actions) {
      const t = reduceMode(state, a);
      const s = t.state;
      checked++;
      if (s.mode !== 'ASK') assert.equal(s.returnMode, s.mode);
      if (s.mode === 'ASK') assert.notEqual(s.returnMode, 'ASK' as Mode);
      // An ASK that ends by finish/cancel (not by an explicit switch) returns to the mode it came from.
      if (state.mode === 'ASK' && (a.type === 'ask_cancelled' || a.type === 'ask_finished') && t.askEnded) {
        assert.equal(s.mode, beforeAsk);
      }
      walk(s, depth - 1, s.mode === 'ASK' ? (state.mode === 'ASK' ? beforeAsk : state.mode) : null);
    }
  };
  walk(INITIAL_MODE_STATE, 6, null);
  assert.ok(checked > 10000);
});
