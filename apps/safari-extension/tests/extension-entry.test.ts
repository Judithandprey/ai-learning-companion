// WebExtension entry: the DOM-free capture checks (capture-evidence.ts) and the shipped folder's
// permission boundary. Browser behavior is checked by scripts/extension-check.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { cropBox, dispatchWhenLive, imageGeometry, LatestOnly, readPngDataUrl, viewGeometry, type ViewState } from '../src/capture-evidence.ts';

/** A PNG header only (signature + IHDR); enough for the size check, not a decodable image. */
function pngHeader(width: number, height: number): string {
  const bytes = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  for (const v of [width, height]) bytes.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  bytes.push(8, 6, 0, 0, 0, 0, 0, 0, 0);
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

test('a received image must be a non-empty PNG with a size', () => {
  const ok = readPngDataUrl(pngHeader(1246, 903));
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual([ok.image.width, ok.image.height], [1246, 903]);
  const bad: Array<[unknown, RegExp]> = [
    ['', /no image came back/],
    ['data:,', /no image came back/],
    [undefined, /no image came back/],
    ['data:image/jpeg;base64,/9j/4AAQ', /not a PNG image/],
    ['data:image/png;base64,', /empty PNG/],
    ['data:image/png;base64,***', /not valid base64/],
    [`data:image/png;base64,${btoa('GIF89a-not-a-png-but-long-enough-to-check')}`, /not a PNG image/],
    [pngHeader(0, 903), /no pixels/],
  ];
  for (const [input, reason] of bad) {
    const r = readPngDataUrl(input);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, reason, String(input).slice(0, 30));
  }
});

test('the image is related to the page only when it spans the viewport at devicePixelRatio', () => {
  assert.deepEqual(imageGeometry({ width: 2560, height: 1600 }, { width: 1280, height: 800, device_pixel_ratio: 2 }), { known: true, scale: 2 });
  assert.deepEqual(imageGeometry({ width: 1280 + 17, height: 800 }, { width: 1280, height: 800, device_pixel_ratio: 1 }), { known: true, scale: 1 }, 'a scrollbar is allowed');
  const padded = imageGeometry({ width: 2560, height: 1800 }, { width: 1280, height: 800, device_pixel_ratio: 2 });
  assert.equal(padded.known, false);
  if (!padded.known) assert.match(padded.reason, /does not match the page viewport/);
  assert.equal(imageGeometry({ width: 1280, height: 800 }, { width: 1280, height: 800, device_pixel_ratio: 2 }).known, false, 'half resolution is not guessed');
  assert.equal(imageGeometry({ width: 10, height: 10 }, { width: 0, height: 800, device_pixel_ratio: 1 }).known, false);
});

test('pinch zoom, or any scroll, zoom or resize while the image is taken, makes the region unknown', () => {
  const image = { width: 1246, height: 903 };
  const base: ViewState = { width: 1246, height: 903, dpr: 1, scrollX: 0, scrollY: 120, zoom: { scale: 1, offsetLeft: 0, offsetTop: 0 } };
  assert.deepEqual(viewGeometry(image, base, base), { known: true, scale: 1 });
  assert.deepEqual(viewGeometry(image, { ...base, zoom: null }, { ...base, zoom: null }), { known: true, scale: 1 }, 'no visual viewport API: size decides');
  const cases: Array<[string, ViewState, ViewState, RegExp]> = [
    ['pinch zoom', { ...base, zoom: { scale: 2, offsetLeft: 400, offsetTop: 300 } }, { ...base, zoom: { scale: 2, offsetLeft: 400, offsetTop: 300 } }, /pinch-zoomed/],
    ['zoom offset only', { ...base, zoom: { scale: 1, offsetLeft: 0, offsetTop: 40 } }, base, /pinch-zoomed/],
    ['scrolled while capturing', base, { ...base, scrollY: 320 }, /scrolled, zoomed or resized/],
    ['resized while capturing', base, { ...base, width: 1000 }, /scrolled, zoomed or resized/],
    ['DPR changed (browser zoom)', base, { ...base, dpr: 1.25 }, /scrolled, zoomed or resized/],
  ];
  for (const [label, before, after, reason] of cases) {
    const g = viewGeometry(image, before, after);
    assert.equal(g.known, false, label);
    if (!g.known) assert.match(g.reason, reason, label);
  }
});

test('the crop is the marked rectangle in image pixels, rounded outward and clipped', () => {
  const image = { width: 2560, height: 1600 };
  const g = imageGeometry(image, { width: 1280, height: 800, device_pixel_ratio: 2 });
  assert.deepEqual(cropBox({ x: 10.3, y: 20.6, width: 100.2, height: 50.1 }, g, image), { x: 20, y: 41, width: 201, height: 101 });
  assert.deepEqual(cropBox({ x: 1270, y: 790, width: 50, height: 50 }, g, image), { x: 2540, y: 1580, width: 20, height: 20 });
  assert.equal(cropBox({ x: 1300, y: 10, width: 10, height: 10 }, g, image), null, 'outside the image');
  assert.equal(cropBox({ x: 0, y: 0, width: 10, height: 10 }, { known: false, reason: 'x' }, image), null, 'unknown geometry: no crop');
});

test('only the latest answer counts; older ones, late ones and any after Stop are retired', () => {
  const t = new LatestOnly();
  const a = t.issue();
  const b = t.issue();
  assert.equal(t.accept(a), false, 'older');
  assert.equal(t.accept(b), true, 'latest');
  t.discard(); // an answer after its timeout
  assert.equal(t.retired, 2);
  const c = t.issue();
  t.stop();
  assert.equal(t.accept(c), false, 'after stop');
  assert.equal(t.retired, 3);
  assert.equal(t.stopped, true);
});

test('a capture request is fenced: Stop or a newer mark during the paint wait sends nothing', async () => {
  const t = new LatestOnly();
  let sends = 0;
  const send = async () => {
    sends += 1;
    return 'sent';
  };
  // Stop arrives while waiting for the page to paint.
  let release!: () => void;
  const ticket = t.issue();
  const pending = dispatchWhenLive(() => new Promise<void>((r) => (release = r)), () => t.isCurrent(ticket), send);
  t.stop();
  release();
  assert.equal(await pending, null);
  assert.equal(sends, 0, 'no request after Stop');
  // A newer mark replaces the older one during its wait.
  const u = new LatestOnly();
  const first = u.issue();
  let go!: () => void;
  const older = dispatchWhenLive(() => new Promise<void>((r) => (go = r)), () => u.isCurrent(first), send);
  u.issue();
  go();
  assert.equal(await older, null);
  assert.equal(sends, 0);
  // Still current: sent once.
  const v = new LatestOnly();
  const only = v.issue();
  assert.equal(await dispatchWhenLive(async () => undefined, () => v.isCurrent(only), send), 'sent');
  assert.equal(sends, 1);
  assert.equal(v.retired, 0, 'isCurrent does not count');
});

test('the shipped extension folder asks only for activeTab and scripting, and injects nothing on its own', () => {
  const dir = new URL('../webextension/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting']);
  for (const key of ['host_permissions', 'optional_host_permissions', 'content_scripts', 'web_accessible_resources', 'externally_connectable']) assert.equal(manifest[key], undefined, key);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.deepEqual(readdirSync(dir).sort(), ['background.js', 'content.js', 'icon-128.png', 'icon-48.png', 'icon-96.png', 'manifest.json']);
  for (const [size, file] of Object.entries({ ...manifest.icons, ...manifest.action.default_icon }) as Array<[string, string]>) {
    const png = readFileSync(new URL(file, dir));
    const side = (png[16]! << 24) | (png[17]! << 16) | (png[18]! << 8) | png[19]!;
    assert.equal(side, Number(size), `${file} is ${size} px`);
  }
  const background = readFileSync(new URL('background.js', dir), 'utf8');
  const content = readFileSync(new URL('../src/extension-content.ts', import.meta.url), 'utf8');
  for (const name of ['CAPTURE_MESSAGE', 'STOPPED_MESSAGE']) {
    const message = new RegExp(`${name} = '([^']+)'`);
    assert.ok(message.exec(background)?.[1], name);
    assert.equal(message.exec(background)?.[1], message.exec(content)?.[1], `both sides use the same ${name}`);
  }
  assert.match(background, /sender\.id === api\.runtime\.id && sender\.frameId === 0/, 'messages are accepted only from our own top-frame script');
  assert.match(background, /format: 'png'/, 'PNG requested explicitly');
  assert.match(background, /frameIds: \[0\]/, 'top frame only');
  assert.doesNotMatch(background, /fetch\(|XMLHttpRequest|storage\./, 'no network or storage in the background');
});
