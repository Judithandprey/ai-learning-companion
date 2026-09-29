// The WebExtension background's ink store (webextension/background.js with its generated reader
// ink-format.js), run in a VM context with a controlled IndexedDB (WS1). Adapted from the lead's storage
// probe. Not browser evidence: scripts/ink-check.mjs covers the real extension.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { addStroke, emptyInk, type InkStroke } from '../src/ink.ts';

const DIR = new URL('../webextension/', import.meta.url);
const PAGE = { origin: 'https://course.example', address_sha256: 'a'.repeat(64) };
const KEY = `${PAGE.origin} ${PAGE.address_sha256}`;
const SENDER = { id: 'extension-under-test', frameId: 0, tab: { id: 1 }, url: 'https://course.example/p?problem=1#part-a' };
const stroke = (id: string): InkStroke => ({
  id,
  input: 'mouse',
  display: 'content',
  points: [[10, 20, 0, 0.5], [30, 40, 16, 0.5]],
  created_at: '2026-09-29T13:00:00.000Z',
  source: { title: 'Lecture', viewport: { width: 1000, height: 800, dpr: 1 }, scroll: { x: 0, y: 0 } },
  anchor: null,
  derived_from: null,
});
const first = addStroke(emptyInk(PAGE), stroke('stroke-1'), '2026-09-29T13:00:00.000Z');
const second = addStroke(first, stroke('stroke-2'), '2026-09-29T13:00:01.000Z');

type Answer = { ok: boolean; reason?: string; conflict?: boolean; doc?: unknown };

/** The shipped background in a fresh context, with an in-memory IndexedDB whose commits can be made to fail. */
function background(): { records: Map<string, unknown>; failCommit: (on: boolean) => void; save: (doc: unknown, sender?: object) => Promise<Answer>; load: () => Promise<Answer> } {
  const records = new Map<string, unknown>();
  let failing = false;
  const db = {
    transaction(_name: string, mode: string) {
      const staged = new Map(records);
      const tx: Record<string, unknown> & { error: Error | null } = { error: null };
      tx['objectStore'] = () => ({
        get(key: string) {
          const request: Record<string, unknown> = {};
          queueMicrotask(() => {
            request['result'] = structuredClone(staged.get(key));
            (request['onsuccess'] as (() => void) | undefined)?.();
            queueMicrotask(() => {
              if (failing) {
                tx.error = new Error('controlled commit failure');
                return (tx['onabort'] as () => void)();
              }
              if (mode === 'readwrite') for (const [k, v] of staged) records.set(k, structuredClone(v));
              (tx['oncomplete'] as () => void)();
            });
          });
          return request;
        },
        put(value: unknown, key: string) {
          staged.set(key, structuredClone(value));
        },
      });
      return tx;
    },
  };
  const indexedDB = {
    open() {
      const request: Record<string, unknown> = { result: db };
      queueMicrotask(() => (request['onsuccess'] as () => void)());
      return request;
    },
  };
  let handler: (message: unknown, sender: unknown, reply: (a: Answer) => void) => boolean = () => false;
  const noop = { addListener() {} };
  const chrome = { runtime: { id: SENDER.id, onMessage: { addListener: (f: typeof handler) => (handler = f) } }, action: { onClicked: noop }, tabs: { onActivated: noop, onUpdated: noop } };
  const context = vm.createContext({ chrome, indexedDB, URL, structuredClone, queueMicrotask });
  context['importScripts'] = (file: string) => vm.runInContext(readFileSync(new URL(file, DIR), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('background.js', DIR), 'utf8'), context);
  const ask = (message: object, sender: object = SENDER): Promise<Answer> =>
    new Promise((resolve) => assert.equal(handler(structuredClone(message), sender, resolve), true));
  return {
    records,
    failCommit: (on) => (failing = on),
    save: (doc, sender) => ask({ type: 'lc-ink-save/v1', doc }, sender),
    load: () => ask({ type: 'lc-ink-load/v1', address_sha256: PAGE.address_sha256 }),
  };
}

test('WS1 control: a valid document is saved, replayed and extended; the read is a copy', async () => {
  const bg = background();
  assert.equal((await bg.save(first)).ok, true);
  assert.equal((await bg.save(first)).ok, true, 'the same document again');
  assert.equal((await bg.save(second)).ok, true, 'extended history');
  assert.deepEqual(bg.records.get(KEY), second);
  const read = await bg.load();
  assert.deepEqual(read.doc, second);
  (read.doc as unknown as { strokes: Record<string, { points: number[][] }> }).strokes['stroke-1']!.points[0]![0] = 900;
  assert.deepEqual(bg.records.get(KEY), second, 'changing the read copy changes nothing stored');
});

test('WS1: a stored record this version cannot read is never overwritten, even by a valid save', async () => {
  for (const [label, broken] of [
    ['unknown format', { ...first, format: 'something-else' }],
    ['revision that is not the history length', { ...first, revision: 999 }],
    ['visible set its history does not produce', { ...first, visible: [] }],
    ['not a document', 'raw bytes'],
  ] as const) {
    const bg = background();
    bg.records.set(KEY, structuredClone(broken));
    const answer = await bg.save(second);
    assert.equal(answer.ok, false, label);
    assert.match(answer.reason ?? '', /cannot be read by this version/, label);
    assert.deepEqual(bg.records.get(KEY), broken, `${label}: stored bytes preserved`);
  }
});

test('WS1: an incoming document that does not read as complete ink is refused (nothing stored or replaced)', async () => {
  const bg = background();
  assert.equal((await bg.save(first)).ok, true);
  for (const [label, bad] of [
    ['visible emptied, history kept', { ...second, visible: [] }],
    ['revision 999', { ...second, revision: 999 }],
    ['unknown format', { ...second, format: 'x' }],
    ['another origin', { ...second, page: { ...PAGE, origin: 'https://foreign.example' } }],
  ] as const) {
    const answer = await bg.save(bad);
    assert.equal(answer.ok, false, label);
    assert.deepEqual(bg.records.get(KEY), first, `${label}: the stored document is unchanged`);
  }
});

test('WS1 controls: conflicts, commit failures and foreign senders keep what is stored', async () => {
  const bg = background();
  assert.equal((await bg.save(second)).ok, true);
  const other = addStroke(first, stroke('stroke-other'), '2026-09-29T13:00:02.000Z'); // another tab's branch
  const conflict = await bg.save(other);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, true);
  assert.equal((await bg.save(first)).conflict, true, 'a shorter history');
  const third = addStroke(second, stroke('stroke-3'), '2026-09-29T13:00:03.000Z');
  bg.failCommit(true);
  assert.equal((await bg.save(third)).ok, false, 'no "saved" without a commit');
  bg.failCommit(false);
  assert.equal((await bg.save(third, { ...SENDER, frameId: 1 })).ok, false, 'a subframe');
  assert.equal((await bg.save(third, { ...SENDER, id: 'another-extension' })).ok, false, 'another extension');
  assert.deepEqual(bg.records.get(KEY), second);
});
