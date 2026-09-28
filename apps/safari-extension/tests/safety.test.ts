// Static guard for the page-facing source: no HTML injection sinks, dynamic code,
// page credential stores or network calls. Rendering must use textContent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const SRC = new URL('../src/', import.meta.url);

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\.innerHTML\b/, 'innerHTML'],
  [/\.outerHTML\b/, 'outerHTML'],
  [/insertAdjacentHTML/, 'insertAdjacentHTML'],
  [/document\.write/, 'document.write'],
  [/\beval\s*\(/, 'eval'],
  [/new\s+Function\s*\(/, 'new Function'],
  [/createContextualFragment/, 'createContextualFragment'],
  [/DOMParser/, 'DOMParser'],
  [/document\.cookie/, 'document.cookie'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bsessionStorage\b/, 'sessionStorage'],
  [/\bindexedDB\b/, 'indexedDB'],
  [/\bfetch\s*\(/, 'fetch'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/sendBeacon/, 'sendBeacon'],
  [/\.value\b(?!s)/, 'form value read'],
];

test('page-facing source has no injection sinks, credential reads or network calls', () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length >= 8);
  for (const file of files) {
    const text = readFileSync(new URL(file, SRC), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    for (const [pattern, name] of FORBIDDEN) assert.doesNotMatch(text, pattern, `${file} uses ${name}`);
  }
});
