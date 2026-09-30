// Test harness (not a test file): the shipped WebExtension background (webextension/background.js with
// its generated reader ink-format.js) in a VM context, with an in-memory IndexedDB whose commits can be
// made to fail. Adapted from the lead's storage probe. Used by background-ink.test.ts and ink-layer.test.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const DIR = new URL('../webextension/', import.meta.url);
export const SENDER = { id: 'extension-under-test', frameId: 0, tab: { id: 1 }, url: 'https://course.example/p?problem=1#part-a' };

export type Answer = { ok: boolean; reason?: string; conflict?: boolean; doc?: unknown };

/** The shipped background in a fresh context, with an in-memory IndexedDB whose commits can be made to fail. */
export function background(): {
  ask: (message: object, sender?: object) => Promise<Answer>;
  records: Map<string, unknown>;
  failCommit: (on: boolean) => void;
  save: (doc: unknown, sender?: object) => Promise<Answer>;
  saveCopy: (doc: unknown, copy: unknown) => Promise<Answer>;
  load: (addressSha256?: string) => Promise<Answer>;
} {
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
        getAll(range: { lower: string; upper: string }) {
          return { result: [...staged].filter(([k]) => k >= range.lower && k <= range.upper).map(([, v]) => structuredClone(v)) };
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
  const IDBKeyRange = { bound: (lower: string, upper: string) => ({ lower, upper }) };
  const context = vm.createContext({ chrome, indexedDB, IDBKeyRange, URL, structuredClone, queueMicrotask });
  context['importScripts'] = (file: string) => vm.runInContext(readFileSync(new URL(file, DIR), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('background.js', DIR), 'utf8'), context);
  const ask = (message: object, sender: object = SENDER): Promise<Answer> =>
    new Promise((resolve) => assert.equal(handler(structuredClone(message), sender, resolve), true));
  return {
    ask,
    records,
    failCommit: (on) => (failing = on),
    save: (doc, sender) => ask({ type: 'lc-ink-save/v1', doc }, sender),
    saveCopy: (doc, copy) => ask({ type: 'lc-ink-save/v1', doc, copy }),
    load: (addressSha256 = 'a'.repeat(64)) => ask({ type: 'lc-ink-load/v1', address_sha256: addressSha256 }),
  };
}
