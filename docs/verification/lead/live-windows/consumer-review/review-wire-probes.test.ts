import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, plain, quitLinks, running, settle as ready, type FakeWindow } from './main-harness.ts';
import { overlayPage, until } from './overlay-page.ts';
import { DEFAULT_RETENTION_POLICY } from '../src/shared/retention.ts';
import { connectorConfig, fakeConnectors, removeConfigs } from './subscription-fakes.ts';

after(quitLinks);
after(removeConfigs);
const POLICY = { max_submissions: 12, max_session_ms: 600_000, min_observation_interval_ms: 500 };
const settle = () => new Promise<void>((r) => setImmediate(r));
async function app(ai = true) {
  const fakes = fakeConnectors();
  const h = harness({ env: { LC_SUBSCRIPTION_CONNECTOR: connectorConfig() }, subscription: { spawn: fakes.spawn, request_ms: 1000, ask_ms: 1000, end_ms: 500 } });
  await ready();
  const control = h.control() as unknown as FakeWindow;
  const press = (channel: string, ...args: unknown[]) => h.handlers[channel]!({ sender: control.webContents }, ...args);
  press('lc:sub-check');
  await until('signed in', () => (plain(press('lc:sub-state')) as any).state === 'signed_in');
  const s = await running(h, ai ? { policy: POLICY } : null);
  if (ai) await until('AI ready', () => (plain(press('lc:session-state')) as any).live.state === 'on');
  const page = await overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
  page.scene.exactPng = true;
  const live = () => (plain(press('lc:session-state')) as any).live;
  const change = async (shade: number) => { page.scene.shade = shade; await page.review.sample(); await page.review.pending(); await settle(); };
  return { h, s, page, press, live, c: fakes.last(), change };
}

test('review: explicit AI Start on unchanged current screen must deliver a fresh first observation', async () => {
  const w = await app(false);
  await w.change(90);
  assert.equal(w.page.review.retention().retained, 1);
  assert.deepEqual(plain(await w.press('lc:live-start', POLICY)), { ok: true });
  await w.change(90);
  await w.change(90);
  w.h.fire(500);
  await settle();
  console.log('UNCHANGED_START', JSON.stringify({ live: w.live(), observations: w.c.looks().length, retained: w.page.review.retention().retained }));
  assert.equal(w.c.looks().length, 1, 'freshly enabled AI receives the current authorized display even if retention already has identical pixels');
});

test('review: AI Stop fences an early result buffered until the selection acknowledgement', async () => {
  const w = await app();
  const release = w.page.holdSubmitAck();
  w.page.press('ASK');
  w.page.pointer('pointerdown', 2, 190, 95);
  for (const [x, y] of [[400, 95], [400, 125], [190, 125]]) w.page.pointer('pointermove', 2, x, y);
  w.page.pointer('pointerup', 2, 192, 97);
  await until('automatic focus request', () => w.c.asks().length === 1);
  w.c.answer('BUFFERED_BEFORE_AI_STOP');
  await until('provider response processed', () => w.live().out === 0);
  await settle();
  assert.equal(w.page.ask().answer, null);
  w.press('lc:live-stop');
  await until('AI stopped', () => w.live().state === 'ended');
  await settle();
  release();
  await settle();
  await settle();
  console.log('LATE_PRESENTATION', JSON.stringify({ live: w.live(), card: w.page.ask() }));
  assert.equal(w.page.ask().answer, null, 'AI-only Stop must fence the queued text as well as provider and voice');
});
