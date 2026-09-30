// Executes only the exact extracted unreadable helper with filesystem doubles, not the uploader suite.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { test, after } from 'node:test';
const sourcePath = '/home/agentsdock/Projects/learning-companion/repo/apps/windows/tests/uploader.test.ts';
const source = fs.readFileSync(sourcePath, 'utf8');
const helper = source.match(/    const unreadable = \(file: string\): \(\(\) => void\) => \{[\s\S]*?\n    \};/)[0];
const code = stripTypeScriptTypes(helper) + '\nglobalThis.extractedHelper = unreadable;';
const results = [];
for (const behavior of ['expected_EBUSY', 'unexpected_success', 'unexpected_EACCES']) {
  test('exclusive-open cleanup: ' + behavior, () => {
    const held = new Set(); let opens = 0; const operations = [];
    const fake = {
      constants: { O_RDONLY: 0 },
      openSync(file, flags) {
        operations.push({ operation: 'open', file, flags });
        if (++opens === 1) { held.add(101); return 101; }
        if (behavior === 'unexpected_success') { held.add(102); return 102; }
        throw Object.assign(new Error('synthetic open error'), { code: behavior === 'expected_EBUSY' ? 'EBUSY' : 'EACCES' });
      },
      closeSync(fd) { operations.push({ operation: 'close', fd }); assert(held.delete(fd)); }
    };
    const context = vm.createContext({ fs: fake, assert, process: { platform: 'win32' } });
    vm.runInContext(code, context);
    let release, error;
    try { release = context.extractedHelper('synthetic-ink.json'); }
    catch (e) { error = String(e); }
    finally { if (release) release(); } // exact caller release pattern: unavailable if helper throws
    const remaining = [...held];
    if (behavior === 'expected_EBUSY') { assert.equal(error, undefined); assert.deepEqual(remaining, []); }
    else { assert(error?.includes('AssertionError')); assert.deepEqual(remaining, []); }
    results.push({ behavior, passed_reproduction: true, remaining_exclusive_handles: remaining, error: error ?? null, operations });
  });
}
after(() => fs.writeFileSync('/tmp/windows-portability-388-cleanup-fixed.json', JSON.stringify({ mode: 'Exact extracted source helper with filesystem doubles; no Windows/native execution and no socket', results }, null, 2) + '\n'));
