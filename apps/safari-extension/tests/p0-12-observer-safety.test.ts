// P0-12: the answer-entry observer may only listen and read. It must never fill,
// click, dispatch or submit anything on a page (R51/A42: observation does not
// authorize AI answer filling or submission).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\.value\s*=(?!=)/, 'assigns a value'],
  [/\.checked\s*=(?!=)/, 'assigns checked'],
  [/\.textContent\s*=(?!=)/, 'assigns text'],
  [/\.innerText\s*=(?!=)/, 'assigns text'],
  [/\.innerHTML/, 'uses innerHTML'],
  [/dispatchEvent\s*\(/, 'dispatches events'],
  [/\.click\s*\(/, 'clicks'],
  [/\.focus\s*\(/, 'moves focus'],
  [/submit\s*\(/, 'submits'],
  [/setRangeText|execCommand|setSelectionRange/, 'edits text'],
  [/\bfetch\s*\(|XMLHttpRequest|sendBeacon/, 'network'],
  [/document\.cookie|localStorage|sessionStorage/, 'credentials/storage'],
];

test('entry observer source has no write, input, submit or network operations', () => {
  const src = readFileSync(new URL('../fixture/src/entry-observer.ts', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
  for (const [pattern, what] of FORBIDDEN) assert.doesNotMatch(src, pattern, `observer ${what}`);
  // Password, hidden and file inputs are never read.
  assert.match(src, /'password'/);
});
