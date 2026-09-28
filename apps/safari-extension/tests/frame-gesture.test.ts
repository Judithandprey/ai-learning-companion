import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, freezeDomSnapshot, sha256Hex, snapshotLocation } from '../src/frame.ts';
import { classifyStroke } from '../src/gesture.ts';
import { SYNTHETIC_IDENTITY, resolveFixtureSource } from '../src/fixture-data.ts';
import { counterIds, fixedClock, snapshot } from './helpers.ts';

const SOURCE = { source_id: 'web-probe-fixture', source_version: 1, source_timezone: 'America/Los_Angeles' };

test('canonical JSON is key-order independent and rejects non-finite numbers', () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, 'x'], c: { z: 1, y: 2 } }), '{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}');
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
  assert.throws(() => canonicalJson({ a: NaN }), /non-finite/);
  assert.throws(() => canonicalJson({ a: Infinity }), /non-finite/);
});

test('sha256Hex matches a known digest', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('snapshot location drops credentials, query and fragment', () => {
  assert.deepEqual(snapshotLocation('https://user:pw@course.example.invalid/video/7?sig=abc&t=3#x'), {
    origin: 'https://course.example.invalid',
    path: '/video/7',
    query_omitted: true,
  });
  assert.equal(snapshotLocation('http://localhost:4173/fixture/index.html').query_omitted, false);
});

test('a frozen frame is an honest dom_snapshot whose hash covers its bytes', async () => {
  const snap = snapshot({ media: { current_time: 42.25, paused: false, active_cues: ['Eigenvectors keep their direction.'], cue_access: 'readable' } });
  const { frame, artifactBytes } = await freezeDomSnapshot(snap, SYNTHETIC_IDENTITY, SOURCE, counterIds(), fixedClock());
  assert.equal(frame.representation, 'dom_snapshot');
  assert.equal(frame.media_position, 42.25);
  assert.equal(frame.content_hash, await sha256Hex(artifactBytes));
  assert.equal(JSON.parse(artifactBytes).pixels, 'not_captured');
  assert.equal(frame.width, 1000);
  assert.equal(frame.height, 800);
  assert.match(frame.captured_at, /Z$/);
});

test('a video without loaded media gives no media position (not 0 s)', async () => {
  const snap = snapshot({ media: { current_time: null, paused: true, active_cues: [], cue_access: 'none' } });
  const { frame } = await freezeDomSnapshot(snap, SYNTHETIC_IDENTITY, SOURCE, counterIds(), fixedClock());
  assert.equal(frame.media_position, null);
});

test('without media the frame has no media position', async () => {
  const { frame } = await freezeDomSnapshot(snapshot(), SYNTHETIC_IDENTITY, SOURCE, counterIds(), fixedClock());
  assert.equal(frame.media_position, null);
});

test('only the owned fixture page resolves to a source, with its declared version', () => {
  assert.deepEqual(resolveFixtureSource(snapshot({ version: '2' })), { ...SOURCE, source_version: 2 });
  assert.equal(resolveFixtureSource(snapshot({ origin: 'https://bcourses.berkeley.edu' })), null);
  assert.equal(resolveFixtureSource(snapshot({ path: '/other.html' })), null);
  for (const version of [null, '0', '1.5', '-1', 'abc', ' 1', '1e3']) {
    assert.equal(resolveFixtureSource(snapshot({ version })), null, String(version));
  }
});

test('stroke classification: tap, sweep, lasso, ambiguous', () => {
  assert.equal(classifyStroke([{ x: 10, y: 10 }, { x: 13, y: 12 }])?.kind, 'tap');
  assert.equal(classifyStroke([{ x: 10, y: 100 }, { x: 80, y: 104 }, { x: 200, y: 110 }])?.kind, 'sweep');
  const loop = [];
  for (let i = 0; i <= 24; i++) loop.push({ x: 200 + 60 * Math.cos((i / 24) * 2 * Math.PI), y: 200 + 40 * Math.sin((i / 24) * 2 * Math.PI) });
  assert.equal(classifyStroke(loop)?.kind, 'lasso');
  const open = loop.slice(0, 19); // three quarters of a loop: not closed, not a line
  assert.equal(classifyStroke(open)?.kind, 'ambiguous');
  assert.equal(classifyStroke([{ x: 10, y: 10 }, { x: 20, y: 90 }])?.kind, 'ambiguous');
  assert.equal(classifyStroke([]), null);
  assert.equal(classifyStroke([{ x: NaN, y: 1 }]), null);
});

test('the embedded fixture frame is its own synthetic source', () => {
  assert.deepEqual(resolveFixtureSource(snapshot({ path: '/fixture/frame.html', origin: 'http://127.0.0.1:4173' })), {
    source_id: 'web-probe-fixture-frame',
    source_version: 1,
    source_timezone: 'America/Los_Angeles',
  });
  assert.equal(resolveFixtureSource(snapshot({ path: '/fixture/control.html' })), null);
  assert.equal(resolveFixtureSource(snapshot({ path: '/fixture/__proto__' })), null);
  assert.equal(resolveFixtureSource(snapshot({ path: 'constructor' })), null);
});
