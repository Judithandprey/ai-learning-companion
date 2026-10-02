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

test('review: first material frame recovers after transient encoding and retention-write failure without a screen change', async () => {
  for (const failure of ['encoding', 'write']) {
    const w = await app();
    if (failure === 'encoding') w.page.scene.encodingFails = true;
    else w.h.failWrites.only = 'frames';
    await w.change(90);
    assert.equal(w.c.looks().length, 0);
    assert.equal(w.page.review.retention().refused, 1);
    w.page.scene.encodingFails = false;
    w.h.failWrites.only = null;
    await w.page.review.sameFrameLate(0);
    await w.page.review.pending();
    await settle();
    await until('recovered first observation', () => w.c.looks().length === 1);
    assert.equal(w.page.review.retention().retained, 1);
  }
});

test('review: separate first-picture encoding crossing Stop/Start cannot enter the new session', async () => {
  const w = await app(false);
  await w.change(90);
  assert.deepEqual(plain(await w.press('lc:live-start', POLICY)), { ok: true });
  const old = w.live().id;
  let release!: () => void;
  w.page.encoding.gate = new Promise<void>((r) => { release = r; });
  await w.page.review.sameFrameLate(0);
  await settle();
  assert.equal(w.c.looks().length, 0);
  w.press('lc:live-stop');
  assert.deepEqual(plain(await w.press('lc:live-start', POLICY)), { ok: true });
  assert.notEqual(w.live().id, old);
  w.page.encoding.gate = null;
  release();
  await settle();
  await settle();
  assert.equal(w.c.looks().length, 0);
  await w.page.review.sameFrameLate(0);
  await w.page.review.pending();
  await settle();
  await until('new-session fresh first observation', () => w.c.looks().length === 1);
  assert.equal(w.c.looks()[0]!.params['session_id'], w.live().id);
});
