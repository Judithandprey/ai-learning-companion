// The overlay's capture start and end, run as the real overlay.ts functions with the browser's capture
// replaced by fakes: a stream that arrives after the capture ended is stopped and never shown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { appSource } from './source.ts';

const OVERLAY = appSource('src/renderer/overlay.ts');
const FUNCTIONS = OVERLAY.slice(OVERLAY.indexOf('async function startCapture('), OVERLAY.indexOf('/** A grid of the frame'));

function overlay(arm: Promise<boolean>, media: Promise<unknown>) {
  const calls = { played: 0, asked: 0, ended: [] as string[] };
  const ctx = {
    lc: { armCapture: () => arm, ended: (reason: string) => void calls.ended.push(reason) },
    navigator: { mediaDevices: { getDisplayMedia: () => ((calls.asked += 1), media) } },
    video: { srcObject: null as unknown, requestVideoFrameCallback() {}, play: async () => void (calls.played += 1) },
    onFrame() {},
    takeSample: async () => {},
    render() {},
    Promise,
  };
  vm.createContext(ctx);
  vm.runInContext(`let stream = null, ended = false, endReason = '', sampling = Promise.resolve();\n${FUNCTIONS}\nglobalThis.t = { startCapture, endCapture, state: () => ({ ended, stream: stream !== null, shown: video.srcObject !== null }) };`, ctx);
  return { ...(ctx as unknown as { t: { startCapture(): Promise<void>; endCapture(r: string): void; state(): { ended: boolean; stream: boolean; shown: boolean } } }).t, calls };
}
const fakeStream = (surface = 'monitor', audio = 0) => {
  const stops = { n: 0 };
  const track = { getSettings: () => ({ displaySurface: surface }), addEventListener() {}, stop: () => void (stops.n += 1) };
  const audioTracks = Array.from({ length: audio }, () => ({ stop: () => void (stops.n += 1) }));
  return { stops, stream: { getTracks: () => [track, ...audioTracks], getVideoTracks: () => [track], getAudioTracks: () => audioTracks } };
};

test('a capture stream that arrives after Stop is stopped at once and never shown', { timeout: 3000 }, async () => {
  let resolveMedia!: (v: unknown) => void;
  const o = overlay(Promise.resolve(true), new Promise((r) => (resolveMedia = r)));
  const starting = o.startCapture();
  for (let i = 0; i < 20 && o.calls.asked === 0; i++) await Promise.resolve();
  assert.equal(o.calls.asked, 1, 'the stream was asked for');
  o.endCapture('stopped while the capture was being granted');
  const { stream, stops } = fakeStream();
  resolveMedia(stream);
  await starting;
  assert.deepEqual(JSON.parse(JSON.stringify(o.state())), { ended: true, stream: false, shown: false });
  assert.equal(stops.n, 1);
  assert.equal(o.calls.played, 0);
});

test('Stop while the capture is being armed asks for no stream', { timeout: 3000 }, async () => {
  let resolveArm!: (v: boolean) => void;
  const o = overlay(new Promise((r) => (resolveArm = r)), new Promise(() => {}));
  const starting = o.startCapture();
  o.endCapture('stopped before the capture was armed');
  resolveArm(true);
  await starting;
  assert.equal(o.calls.asked, 0);
  assert.equal(o.state().stream, false);
  assert.equal(o.calls.played, 0);
});

test('a stream that is not the whole display, or carries audio, is stopped and ends the capture', { timeout: 3000 }, async () => {
  for (const [surface, audio] of [['window', 0], ['monitor', 1]] as const) {
    const { stream, stops } = fakeStream(surface, audio);
    const o = overlay(Promise.resolve(true), Promise.resolve(stream));
    await o.startCapture();
    assert.equal(o.state().stream, false);
    assert.equal(stops.n, 1 + audio);
    assert.match(o.calls.ended.join(), /not the whole chosen display/);
  }
});

test('the chosen display is shown when the stream arrives while capturing', { timeout: 3000 }, async () => {
  const { stream, stops } = fakeStream();
  const o = overlay(Promise.resolve(true), Promise.resolve(stream));
  await o.startCapture();
  assert.deepEqual(JSON.parse(JSON.stringify(o.state())), { ended: false, stream: true, shown: true });
  assert.equal(o.calls.played, 1);
  o.endCapture('stopped');
  assert.equal(stops.n, 1, 'Stop stops it');
});
