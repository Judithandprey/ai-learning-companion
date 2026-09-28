// P0-12: the answer-entry observer may only listen and read. It must never fill,
// click, dispatch or submit anything on a page (R51/A42: observation does not
// authorize AI answer filling or submission).
//
// This is a lint guard over known write, submit, network and storage API names in the
// observer's source. It cannot prove anything about arbitrary JavaScript (aliases,
// computed property names, eval). The behavioral boundary is the browser tripwire in
// scripts/entries-check.mjs (`entries.observer_no_write_calls`), which covers the paths
// that run actually exercises.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DOM_PROPERTY = '(value|checked|indeterminate|selected|selectedIndex|textContent|innerText|innerHTML|outerHTML|nodeValue|src|href|type|hidden|contentEditable|className)';

const FORBIDDEN: Array<[RegExp, string]> = [
  [new RegExp(`\\.${DOM_PROPERTY}\\s*(\\+|-|\\|\\||&&|\\?\\?)?=(?!=)`), 'assigns a DOM property'],
  [/Object\.(assign|defineProperty|defineProperties)\s*\(/, 'assigns properties indirectly'],
  [/Reflect\.(set|apply|construct|defineProperty)\s*\(/, 'assigns or calls reflectively'],
  [/\.(set|remove|toggle)Attribute(NS)?\s*\(/, 'changes attributes'],
  [/\.(append|prepend|appendChild|insertBefore|replaceChild|removeChild|replaceWith|replaceChildren|insertAdjacent\w*|remove)\s*\(/, 'changes the tree'],
  [/dispatchEvent\s*\(/, 'dispatches events'],
  [/\.click\s*(\(|\.(call|apply|bind)\b)|\[\s*['"`]click['"`]\s*\]/, 'clicks (including prototype.click.call)'],
  [/\.(focus|blur|select)\s*\(/, 'moves focus or selection'],
  [/submit|\.reset\s*\(/i, 'submits or resets (any case, e.g. requestSubmit)'],
  [/setRangeText|execCommand|setSelectionRange/, 'edits text'],
  [/getContext|toDataURL|toBlob/, 'creates or reads a canvas context'],
  [/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new\s+Image\b|\.open\s*\(/, 'network'],
  [/document\.cookie|localStorage|sessionStorage|indexedDB|caches\b/, 'credentials/storage'],
  [/\beval\s*\(|new\s+Function\b/, 'dynamic code'],
];

const observerSource = (): string =>
  readFileSync(new URL('../fixture/src/entry-observer.ts', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

function violations(src: string): string[] {
  return FORBIDDEN.filter(([pattern]) => pattern.test(src)).map(([, what]) => what);
}

test('entry observer source uses no known write, input, submit, network, storage or canvas API (lint guard)', () => {
  const src = observerSource();
  assert.deepEqual(violations(src), []);
  // Password, hidden and file inputs are never read.
  assert.match(src, /'password'/);
});

test('the lint guard flags every insertion QA reported as surviving (EO-2)', () => {
  const src = observerSource();
  const inserted = [
    "form.requestSubmit();",
    "HTMLElement.prototype.click.call(el);",
    "Object.assign(el, { value: '1' });",
    "el.value += 'x';",
    "el.setAttribute('checked', '');",
    "new WebSocket('wss://example.invalid');",
    "new Image().src = 'https://example.invalid/b';",
    "indexedDB.open('x');",
    "el.checked ||= true;",
    "el.focus();",
    "canvas.getContext('2d');",
    "document.body.append(node);",
  ];
  for (const line of inserted) assert.notDeepEqual(violations(`${src}\n${line}\n`), [], line);
});
