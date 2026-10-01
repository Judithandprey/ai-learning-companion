// The places of the overlay's movable surfaces and the pieces of a response read aloud: the pure rules
// (src/shared/placement.ts, src/shared/voice.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampRate, cornerOf, DEFAULT_PLACE, DISPLAYS_MAX, isPlace, NO_PREFERENCES, placeAt, PLACEMENT_FORMAT, placesOf, readPreferences, storedPreferences, usableArea, withPlace, type Rect } from '../src/shared/placement.ts';
import { PIECE_MAX, speechPieces } from '../src/shared/voice.ts';

const AREA: Rect = { x: 10, y: 10, width: 1260, height: 740 };
const SIZE = { width: 300, height: 50 };

test('a place puts the surface where it was dragged, and never outside the area: whatever the pointer does, the whole surface stays inside', () => {
  // Inside the area: the corner is exactly where it was wanted.
  for (const [left, top] of [[10, 10], [490, 290], [970, 700], [123.5, 456.25]] as const) {
    const corner = cornerOf(placeAt(left, top, SIZE, AREA), SIZE, AREA);
    assert.deepEqual([Math.round(corner.left * 1000) / 1000, Math.round(corner.top * 1000) / 1000], [left, top]);
  }
  // Wanted outside: held at the edge, on every side.
  for (const [left, top, at] of [[-500, -500, [10, 10]], [5000, 5000, [970, 700]], [-1, 300, [10, 300]], [600, 9999, [600, 700]]] as const) {
    const corner = cornerOf(placeAt(left, top, SIZE, AREA), SIZE, AREA);
    assert.deepEqual([Math.round(corner.left), Math.round(corner.top)], at);
  }
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const p = placeAt(bad, bad, SIZE, AREA);
    assert.equal(isPlace(p), true, `${bad}: still a place inside the area`);
  }
});

test('the same place fits any work area and scale: restored on a smaller, larger or shifted area, the surface is whole and inside it', () => {
  const place = placeAt(700, 500, SIZE, AREA); // kept on a 1280x760 work area
  for (const area of [{ x: 10, y: 10, width: 780, height: 560 }, { x: 10, y: 50, width: 2540, height: 1340 }, { x: 0, y: 0, width: 320, height: 60 }, { x: 10, y: 10, width: 200, height: 30 }]) {
    const c = cornerOf(place, SIZE, area);
    assert.equal(c.left >= area.x && c.top >= area.y, true, JSON.stringify(area));
    if (area.width >= SIZE.width) assert.equal(c.left + SIZE.width <= area.x + area.width + 1e-9, true, 'right edge inside');
    if (area.height >= SIZE.height) assert.equal(c.top + SIZE.height <= area.y + area.height + 1e-9, true, 'bottom edge inside');
  }
  // A surface as large as the area, or larger: held at the area's own corner.
  assert.deepEqual(placeAt(400, 300, { width: 2000, height: 900 }, AREA), { fx: 0, fy: 0 });
  // The starting places: the toolbar at the top right, the card at the bottom right.
  assert.deepEqual([cornerOf(DEFAULT_PLACE.toolbar, SIZE, AREA), cornerOf(DEFAULT_PLACE.caption, { width: 360, height: 200 }, AREA)], [{ left: 970, top: 10 }, { left: 910, top: 550 }]);
  // The usable area is the work area less a margin (smaller on a tiny one), relative to the display's own corner.
  assert.deepEqual([usableArea({ x: 0, y: 0, width: 1280, height: 760 }), usableArea({ x: 0, y: 40, width: 1280, height: 760 }), usableArea({ x: 0, y: 0, width: 24, height: 24 })], [AREA, { x: 10, y: 50, width: 1260, height: 740 }, { x: 6, y: 6, width: 12, height: 12 }]);
});

test('the kept preferences are read only in their exact shape, per display, bounded; the speech rate stays inside its bounds', () => {
  let p = withPlace(NO_PREFERENCES, '1', 'toolbar', { fx: 0.5, fy: 0.25 });
  p = withPlace(p, '1', 'caption', { fx: 0, fy: 1 });
  p = withPlace(p, '2', 'toolbar', { fx: 1.7, fy: -3 }); // clamped as kept
  assert.deepEqual(p.displays, { 'display:1': { toolbar: { fx: 0.5, fy: 0.25 }, caption: { fx: 0, fy: 1 } }, 'display:2': { toolbar: { fx: 1, fy: 0 } } });
  assert.deepEqual([placesOf(p, '2'), placesOf(p, '3')], [{ toolbar: { fx: 1, fy: 0 } }, {}]);
  assert.deepEqual(readPreferences(JSON.parse(storedPreferences(p))), p);
  assert.equal(storedPreferences(p), `{"format":"${PLACEMENT_FORMAT}","displays":{"display:1":{"toolbar":{"fx":0.5,"fy":0.25},"caption":{"fx":0,"fy":1}},"display:2":{"toolbar":{"fx":1,"fy":0}}},"speech_rate":1.3}\n`);
  // At most sixteen displays, the most recently used. The ids are numbers as the system gives them, used in no
  // numeric order: the one dropped is the one used longest ago, also after the file was written and read back.
  let many = NO_PREFERENCES;
  const ids = Array.from({ length: DISPLAYS_MAX + 4 }, (_, i) => String(9000 - 37 * i)); // descending numbers
  for (const id of ids) many = readPreferences(JSON.parse(storedPreferences(withPlace(many, id, 'toolbar', { fx: 0, fy: 0 }))))!;
  many = withPlace(many, ids[10]!, 'caption', { fx: 1, fy: 1 });
  assert.deepEqual([Object.keys(many.displays).length, Object.keys(many.displays)[0], Object.keys(many.displays).at(-1), placesOf(many, ids[10]!)], [DISPLAYS_MAX, `display:${ids[4]}`, `display:${ids[10]}`, { toolbar: { fx: 0, fy: 0 }, caption: { fx: 1, fy: 1 } }]);
  assert.deepEqual([placesOf(many, ids[3]!), placesOf(many, ids[19]!)], [{}, { toolbar: { fx: 0, fy: 0 } }], 'the first four used are the ones dropped');
  // Anything else is not read.
  const good = { format: PLACEMENT_FORMAT, displays: { 'display:1': { toolbar: { fx: 0.5, fy: 0.5 } } }, speech_rate: 1.3 };
  assert.notEqual(readPreferences(good), null);
  for (const bad of [
    null, [], 'x', {}, { ...good, format: 'another/v1' }, { ...good, extra: 1 }, { ...good, speech_rate: 9 }, { ...good, speech_rate: 1.25 }, { ...good, speech_rate: '1.3' },
    { ...good, displays: { 'display:1': { toolbar: { fx: 2, fy: 0 } } } }, { ...good, displays: { 'display:1': { toolbar: { fx: 0.5 } } } }, { ...good, displays: { 'display:1': { toolbar: { fx: 0.5, fy: 0.5, path: 'C:\\' } } } },
    { ...good, displays: { 'display:1': { window: { fx: 0, fy: 0 } } } }, { ...good, displays: { '1': { toolbar: { fx: 0, fy: 0 } } } }, { ...good, displays: { 'display:': { toolbar: { fx: 0, fy: 0 } } } }, { ...good, displays: [] },
    { ...good, displays: Object.fromEntries(Array.from({ length: DISPLAYS_MAX + 1 }, (_, i) => [`display:${i}`, {}])) },
  ]) assert.equal(readPreferences(bad), null, JSON.stringify(bad)?.slice(0, 80));
  assert.deepEqual([0.1, 0.7, 1.3, 1.34, 1.36, 2, 9, Number.NaN].map(clampRate), [0.7, 0.7, 1.3, 1.3, 1.4, 2, 2, 1.3]);
});

test('a response is read in pieces that are its own text, whole and in order: sentences, long ones cut at a space, nothing added or dropped', () => {
  const squeeze = (t: string): string => t.replace(/\s+/g, '');
  const texts = [
    'The slope is 2. So the line rises! Does it cross zero? Yes: at x = -1.',
    'One line only',
    'First line\nSecond line\n\nThird, after a gap.',
    `A very long sentence ${'with many words '.repeat(40)}and an end.`,
    'x'.repeat(700), // no space to cut at
    `${'y'.repeat(219)}😀${'z'.repeat(300)}`, // a pair at the cut
    '中文句子。第二句！第三句？ Then English.',
    '   ',
    '',
  ];
  for (const text of texts) {
    const pieces = speechPieces(text);
    assert.equal(squeeze(pieces.join(' ')), squeeze(text), 'every character is spoken, once, in order');
    for (const p of pieces) {
      assert.equal(p.length > 0 && p.length <= PIECE_MAX && p === p.trim(), true, JSON.stringify(p).slice(0, 60));
      assert.equal(/[\ud800-\udbff]$/.test(p) || /^[\udc00-\udfff]/.test(p), false, 'no piece ends or starts inside a pair');
    }
  }
  assert.deepEqual(speechPieces('The slope is 2. So the line rises! Does it cross zero? Yes: at x = -1.'), ['The slope is 2.', 'So the line rises!', 'Does it cross zero?', 'Yes: at x = -1.']);
  assert.deepEqual([speechPieces(''), speechPieces('   \n ')], [[], []]);
  const long = `A very long sentence ${'with many words '.repeat(40)}and an end.`;
  assert.equal(speechPieces(long).join(' '), long, 'a long sentence is cut only at its spaces');
  assert.deepEqual(speechPieces('First line\nSecond line\n\nThird, after a gap.'), ['First line', 'Second line', 'Third, after a gap.']);
  assert.deepEqual(speechPieces('中文句子。 第二句！ 第三句？ Then English.'), ['中文句子。', '第二句！', '第三句？', 'Then English.']);
});
