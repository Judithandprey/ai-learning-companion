// WRITE ink model (src/ink.ts): partial erase, undo/redo, history replay and strict reading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addStroke, emptyInk, erase, parseInk, redo, stacks, undo, type InkDocument, type InkDisplay, type InkStroke } from '../src/ink.ts';

const PAGE = { origin: 'https://course.example', address_sha256: 'a'.repeat(64) };
let n = 0;
const newId = (): string => `stk_${++n}`;
const at = (): string => `2026-09-29T13:00:${String(n % 60).padStart(2, '0')}.000Z`;
const line = (y: number, display: InkDisplay = 'content', from = 0, to = 100, step = 10): InkStroke => ({
  id: newId(),
  input: 'mouse',
  display,
  points: Array.from({ length: (to - from) / step + 1 }, (_, i) => [from + i * step, y, i * 16, 0.5] as const),
  created_at: at(),
  source: { title: 'Lecture 7', viewport: { width: 1280, height: 800, dpr: 2 }, scroll: { x: 0, y: 0 } },
  anchor: null,
  derived_from: null,
});
const visiblePoints = (doc: InkDocument): number => doc.visible.reduce((sum, id) => sum + doc.strokes[id]!.points.length, 0);

test('a partial erase keeps the original stroke and shows only the surviving pieces', () => {
  const s = line(50);
  let doc = addStroke(emptyInk(PAGE), s, at());
  doc = erase(doc, { content: [[50, 40], [50, 60]] }, 6, at(), newId);
  assert.equal(doc.visible.includes(s.id), false, 'the original is hidden');
  assert.ok(doc.strokes[s.id], 'but kept');
  assert.equal(doc.visible.length, 2, 'two pieces survive');
  for (const id of doc.visible) {
    const piece = doc.strokes[id]!;
    assert.equal(piece.derived_from, s.id);
    assert.ok(piece.points.every((p) => Math.abs(p[0] - 50) > 6), 'no surviving point under the eraser');
  }
  assert.deepEqual(doc.history.map((op) => op.op), ['add', 'erase']);
  assert.deepEqual(doc.history[1]!.removed, [s.id]);
});

test('an eraser that touches nothing records nothing; a thin eraser between sparse points still cuts', () => {
  const sparse = line(50, 'content', 0, 100, 50); // points at 0, 50, 100
  const doc = addStroke(emptyInk(PAGE), sparse, at());
  assert.equal(erase(doc, { content: [[50, 200]] }, 4, at(), newId), doc, 'nothing touched: unchanged');
  const cut = erase(doc, { content: [[25, 45], [25, 55]] }, 2, at(), newId);
  assert.equal(cut.history.length, 2, 'the segment between 0 and 50 was cut');
  assert.equal(cut.visible.length, 2);
});

test('erasing affects only strokes of the same display', () => {
  const content = line(50, 'content');
  const screen = line(50, 'screen');
  let doc = addStroke(addStroke(emptyInk(PAGE), content, at()), screen, at());
  doc = erase(doc, { screen: [[50, 40], [50, 60]] }, 6, at(), newId);
  assert.ok(doc.visible.includes(content.id), 'the content stroke is untouched');
  assert.equal(doc.visible.includes(screen.id), false);
});

test('one eraser gesture over both displays is one operation, undone in one step', () => {
  const content = line(50, 'content');
  const screen = line(50, 'screen');
  let doc = addStroke(addStroke(emptyInk(PAGE), content, at()), screen, at());
  doc = erase(doc, { content: [[50, 40], [50, 60]], screen: [[50, 40], [50, 60]] }, 6, at(), newId);
  assert.equal(doc.history.length, 3);
  assert.deepEqual(doc.history[2]!.removed, [content.id, screen.id]);
  doc = undo(doc, at());
  assert.deepEqual(doc.visible, [content.id, screen.id], 'both back, in their drawing order');
});

test('erase, undo and redo keep the drawing order (INK-A3): pieces take their stroke\'s place', () => {
  const black = line(50, 'content');
  const purple: InkStroke = { ...line(0, 'screen'), points: [[40, 40, 0, 0.5], [60, 60, 10, 0.5]] };
  let doc = addStroke(addStroke(emptyInk(PAGE), black, at()), purple, at());
  const before = [...doc.visible];
  doc = erase(doc, { content: [[10, 50]], screen: [[10, 50]] }, 5, at(), newId); // touches the black line only
  assert.equal(doc.visible.at(-1), purple.id, 'the purple stroke stays on top');
  assert.ok(doc.visible.slice(0, -1).every((id) => doc.strokes[id]!.derived_from === black.id));
  const erased = [...doc.visible];
  doc = undo(doc, at());
  assert.deepEqual(doc.visible, before, 'undo restores the exact order');
  doc = redo(doc, at());
  assert.deepEqual(doc.visible, erased, 'redo too');
  const c = line(70);
  doc = addStroke(undo(doc, at()), c, at());
  assert.deepEqual(doc.visible, [...before, c.id], 'a branch writes on top');
  const reopened = parseInk(JSON.parse(JSON.stringify(doc)), PAGE);
  assert.ok(reopened.ok && reopened.doc.visible.join() === doc.visible.join(), 'and a reopen keeps it');
  const swapped = { ...JSON.parse(JSON.stringify(doc)), visible: [...doc.visible].reverse() };
  assert.equal(parseInk(swapped, PAGE).ok, false, 'a stored order that the history does not produce is refused');
});

test('undo and redo restore exactly, and a new edit after undo branches without losing history', () => {
  const a = line(10);
  const b = line(30);
  let doc = addStroke(addStroke(emptyInk(PAGE), a, at()), b, at());
  doc = erase(doc, { content: [[50, 20], [50, 40]] }, 6, at(), newId); // cuts b only
  const afterErase = [...doc.visible];
  doc = undo(doc, at());
  assert.deepEqual(doc.visible, [a.id, b.id], 'undo erase: b is whole again, in place');
  doc = redo(doc, at());
  assert.deepEqual(doc.visible, afterErase, 'redo erase: the same pieces in the same order');
  doc = undo(doc, at());
  doc = undo(doc, at());
  assert.deepEqual(doc.visible, [a.id], 'undo add b');
  assert.deepEqual(stacks(doc).redo.length, 2);
  const c = line(60);
  doc = addStroke(doc, c, at());
  assert.deepEqual(stacks(doc).redo, [], 'a new stroke clears redo (a branch)');
  assert.equal(redo(doc, at()), doc, 'nothing to redo');
  assert.equal(doc.history.length, 8, 'the undone operations stay in the history (add, add, erase, undo, redo, undo, undo, add)');
  assert.ok(doc.strokes[b.id], 'every original is kept');
});

test('a stored document reopens exactly and keeps editing (undo continues after reload)', () => {
  const a = line(10);
  let doc = addStroke(emptyInk(PAGE), a, at());
  doc = erase(doc, { content: [[50, 0], [50, 20]] }, 6, at(), newId);
  const reopened = parseInk(JSON.parse(JSON.stringify(doc)), PAGE);
  assert.ok(reopened.ok);
  if (!reopened.ok) return;
  assert.deepEqual(reopened.doc, doc);
  const undone = undo(reopened.doc, at());
  assert.deepEqual(undone.visible, [a.id], 'the erase is undone after reopening');
  assert.equal(visiblePoints(undone), a.points.length);
});

test('a stored document is read strictly: another page, tampering and malformed points are refused', () => {
  const doc = addStroke(emptyInk(PAGE), line(10), at());
  const json = JSON.parse(JSON.stringify(doc));
  const other = parseInk(json, { ...PAGE, address_sha256: 'b'.repeat(64) });
  assert.equal(other.ok, false, 'same origin and path, another address (query or fragment): another document');
  if (!other.ok) assert.match(other.reason, /another page/);
  const tampered = { ...json, visible: [] };
  const t = parseInk(tampered, PAGE);
  assert.equal(t.ok, false);
  const id = doc.visible[0]!;
  const broken = { ...json, strokes: { [id]: { ...json.strokes[id], points: [[1, 2, 'x', 0]] } } };
  assert.equal(parseInk(broken, PAGE).ok, false);
  assert.equal(parseInk({ format: 'other' }, PAGE).ok, false);
});

test('a stored history must be one this model records: unknown strokes, gaps and false undo targets are refused', () => {
  const a = line(10);
  let doc = addStroke(emptyInk(PAGE), a, at());
  doc = erase(doc, { content: [[50, 0], [50, 20]] }, 6, at(), newId);
  doc = undo(doc, at());
  const json = JSON.parse(JSON.stringify(doc));
  assert.ok(parseInk(json, PAGE).ok, 'the real document is accepted');
  const ghost = { ...json, strokes: {}, visible: [], revision: 2, history: [{ seq: 1, at: 'x', op: 'add', added: ['ghost'], removed: [] }, { seq: 2, at: 'x', op: 'erase', added: [], removed: ['ghost'] }] };
  assert.equal(parseInk(ghost, PAGE).ok, false, 'operations on strokes that are not stored');
  const gap = { ...json, history: json.history.map((op: { seq: number }, i: number) => (i === 1 ? { ...op, seq: 7 } : op)) };
  assert.equal(parseInk(gap, PAGE).ok, false, 'a sequence gap');
  const wrongUndo = { ...json, history: json.history.map((op: { op: string }) => (op.op === 'undo' ? { ...op, target_seq: 1 } : op)) };
  assert.equal(parseInk(wrongUndo, PAGE).ok, false, 'an undo of another operation than the last one');
  assert.equal(parseInk({ ...json, revision: 9 }, PAGE).ok, false, 'a revision that is not the history length');
  const inherited = { ...json, strokes: {}, visible: ['constructor'], revision: 1, history: [{ seq: 1, at: 'x', op: 'add', added: ['constructor'], removed: [] }] };
  assert.equal(parseInk(inherited, PAGE).ok, false, 'ids that exist only on the object prototype');
  const hidingAdd = { ...json, history: json.history.map((op: { op: string; removed: string[] }, i: number) => (i === 0 ? { ...op, removed: [json.history[0].added[0]] } : op)) };
  assert.equal(parseInk(hidingAdd, PAGE).ok, false, 'an add that hides strokes');
});
