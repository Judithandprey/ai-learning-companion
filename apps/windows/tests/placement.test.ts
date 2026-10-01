// The places of the overlay's movable surfaces and the pieces of a response read aloud: the pure rules
// (src/shared/placement.ts, src/shared/voice.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampRate, cornerOf, DEFAULT_PLACE, DISPLAYS_MAX, isPlace, NO_PREFERENCES, placeAt, PLACEMENT_FORMAT, placesOf, readPreferences, storedPreferences, usableArea, withPlace, type Rect } from '../src/shared/placement.ts';
import { HAN_COST, PIECE_MAX, speechCulture, speechCultures, speechPieces } from '../src/shared/voice.ts';

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
  /** What a piece takes: a letter 1; a Chinese character or a digit HAN_COST. */
  const cost = (p: string): number => [...p].reduce((n, ch) => n + ch.length * (/[\p{Script=Han}\p{Nd}]/u.test(ch) ? HAN_COST : 1), 0);
  const texts = [
    'The slope is 2. So the line rises! Does it cross zero? Yes: at x = -1.',
    'One line only',
    'First line\nSecond line\n\nThird, after a gap.',
    `A very long sentence ${'with many words '.repeat(40)}and an end.`,
    'x'.repeat(700), // no space to cut at
    `${'y'.repeat(219)}😀${'z'.repeat(300)}`, // a pair at the cut
    '中文句子。第二句！第三句？ Then English.',
    '没有空格的长句子'.repeat(60), // Chinese with nowhere to cut at
    `他说：“${'这是一个很长的句子，中间有逗号，'.repeat(12)}结束了。”然后走了。`,
    `Mixed: ${'the term 斜率 (slope) appears here, '.repeat(12)}and ends.`,
    `3.${'1415926535'.repeat(30)}`, // a long run of digits
    `${'今天天气很好!我们去公园玩吧!'.repeat(10)}`, // half-width stops with no space after them
    '】'.repeat(500) + '。' + '”'.repeat(500),
    '   ',
    '',
  ];
  for (const text of texts) {
    const pieces = speechPieces(text);
    assert.equal(squeeze(pieces.join(' ')), squeeze(text), 'every character is spoken, once, in order');
    for (const p of pieces) {
      assert.equal(p.length > 0 && p.length <= PIECE_MAX && p === p.trim(), true, JSON.stringify(p).slice(0, 60));
      assert.equal(cost(p) <= PIECE_MAX, true, `a piece is said within one piece's time: ${cost(p)}`);
      assert.equal(/[\ud800-\udbff]$/.test(p) || /^[\udc00-\udfff]/.test(p), false, 'no piece ends or starts inside a pair');
    }
  }
  assert.deepEqual(speechPieces('The slope is 2. So the line rises! Does it cross zero? Yes: at x = -1.'), ['The slope is 2.', 'So the line rises!', 'Does it cross zero?', 'Yes: at x = -1.']);
  assert.deepEqual([speechPieces(''), speechPieces('   \n ')], [[], []]);
  const long = `A very long sentence ${'with many words '.repeat(40)}and an end.`;
  assert.equal(speechPieces(long).join(' '), long, 'a long sentence is cut only at its spaces');
  assert.deepEqual(speechPieces('First line\nSecond line\n\nThird, after a gap.'), ['First line', 'Second line', 'Third, after a gap.']);
  assert.deepEqual(speechPieces('中文句子。 第二句！ 第三句？ Then English.'), ['中文句子。', '第二句！', '第三句？', 'Then English.']);
  // Chinese sentences end without a space after them; what closes a sentence stays with it; 3.14 is not an end.
  assert.deepEqual(speechPieces('斜率是二。所以直线上升！他问：“它过零点吗？”是的。Pi is 3.14 here.'), ['斜率是二。', '所以直线上升！', '他问：“它过零点吗？”', '是的。', 'Pi is 3.14 here.']);
  assert.deepEqual(speechPieces('真的？！好。'), ['真的？！', '好。']);
  // A Chinese character takes three letters' time: a long Chinese sentence is cut shorter, at its pause marks.
  const chinese = '这是一个很长的句子，中间有逗号，'.repeat(12);
  const cut = speechPieces(chinese);
  assert.deepEqual([cut.join(''), cut.every((p) => p.endsWith('，')), cut.map((p) => p.length)], [chinese, true, [80, 80, 32]], '70 characters and 10 pause marks fill a piece');
  const uneven = '这是一个很长的句子，中间有个逗号；'.repeat(12);
  assert.deepEqual([speechPieces(uneven).join(''), speechPieces(uneven).every((p) => /[，；]$/.test(p)), speechPieces(uneven).length], [uneven, true, 3], 'cut at a pause mark, not in the middle of a clause');
  assert.deepEqual(speechPieces('没有空格的长句子'.repeat(60)).map((p) => p.length), [73, 73, 73, 73, 73, 73, 42], 'nowhere to cut at: hard cuts, nothing dropped');
  // A half-width , ; : is a pause only before white space or a Chinese character: a number, a time, an address and a
  // pair of coordinates stay whole, wherever the limit falls.
  const tail = ['comes to roughly about 1,250,000 dollars in all', 'the quiz begins at 10:45:30 sharp today', 'see https://example.com/a;b:c for the rest of it', 'the point is at (3,4) on the grid and not elsewhere'];
  for (const t of tail) {
    for (let pad = 150; pad < 230; pad += 1) {
      const sentence = `${'word '.repeat(Math.floor(pad / 5))}${'x'.repeat(pad % 5)} ${t}`;
      const cut = speechPieces(sentence);
      assert.equal(cut.join(' ').replace(/\s+/g, ' '), sentence.replace(/\s+/g, ' ').trim(), 'cut only at spaces here');
      for (const whole of ['1,250,000', '10:45:30', 'https://example.com/a;b:c', '(3,4)']) if (t.includes(whole)) assert.equal(cut.some((p) => p.includes(whole)), true, `${whole} stays in one piece (pad ${pad})`);
    }
  }
  assert.deepEqual(speechPieces(`${'很长的中文句子'.repeat(9)},然后还有后面的一半句子`).map((p) => p.at(-1)), [',', '子'], 'a half-width comma before a Chinese character is a pause');
  // A half-width stop with a Chinese character right after it is a place to cut a long sentence at (not a sentence end: 1.首先 stays whole).
  const stops = '今天天气很好!我们去公园玩吧!'.repeat(10);
  assert.deepEqual([speechPieces(stops).join(''), speechPieces(stops).every((p) => p.endsWith('!')), speechPieces('1.首先，2.然后。')], [stops, true, ['1.首先，2.然后。']]);
  // What closes a sentence stays with it, whatever mark it is; a mark alone is no piece of its own; a pause mark after a closed quotation goes on with the sentence.
  assert.deepEqual(speechPieces('他说："你好。"然后走了。'), ['他说："你好。"', '然后走了。']);
  assert.deepEqual(speechPieces('【注意！】下一步。《你好吗？》是一本书。'), ['【注意！】', '下一步。', '《你好吗？》', '是一本书。']);
  assert.deepEqual(speechPieces('**这是重点。**然后继续。'), ['**这是重点。**', '然后继续。']);
  assert.deepEqual(speechPieces('他说“好。”，然后走了。'), ['他说“好。”，然后走了。']);
  assert.deepEqual(speechPieces('真的？!好。。。'), ['真的？!', '好。。。']);
  assert.deepEqual(speechPieces('First.\n---\nSecond.'), ['First.---', 'Second.'], 'a line of marks is said with the piece before it');
  assert.deepEqual(speechPieces('... and so on.'), ['... and so on.']);
  // A digit takes a Chinese character's time: a long figure is cut shorter.
  assert.equal(Math.max(...speechPieces(`3.${'1415926535'.repeat(30)}`).map((p) => p.length)) <= Math.ceil(PIECE_MAX / HAN_COST) + 1, true);
  // The work grows with the text, not with its square: the longest answer, made of closing marks, is cut at once.
  const began = performance.now();
  for (const run of ['。' + '”'.repeat(32_000), '。'.repeat(32_000) + '，', ('。' + '）'.repeat(100)).repeat(320)]) assert.equal(speechPieces(run).join(''), run);
  assert.equal(performance.now() - began < 1500, true, `took ${Math.round(performance.now() - began)} ms`);
  // A piece without a letter is said in the voice of the piece after it (else before it; else English).
  assert.deepEqual(speechCultures(['1.', '首先打开设置。', '2.', '然后选择语言。', '42']), ['zh-CN', 'zh-CN', 'zh-CN', 'zh-CN', 'zh-CN']);
  assert.deepEqual(speechCultures(['1.', 'First.', '2.', 'Second.', '斜率是二。', '3', 'Yes.']), ['en-US', 'en-US', 'en-US', 'en-US', 'zh-CN', 'en-US', 'en-US']);
  assert.deepEqual([speechCultures(['42', '...']), speechCultures([]), speechCultures(['The slope is 2.', '斜率是二。', '它过零点吗？', 'Yes.'])], [['en-US', 'en-US'], [], ['en-US', 'zh-CN', 'zh-CN', 'en-US']]);
  // One character is taken whatever it costs (no limit is too small to end).
  assert.deepEqual(speechPieces('中文', 1), ['中', '文']);
  // The voice a piece is said in: Chinese when it has a Chinese character, else English.
  assert.deepEqual(['The slope is 2.', '斜率是二。', 'The term 斜率 means slope.', '¿Qué? 123', ''].map(speechCulture), ['en-US', 'zh-CN', 'zh-CN', 'en-US', 'en-US']);
});
