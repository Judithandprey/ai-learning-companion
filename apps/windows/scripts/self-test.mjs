#!/usr/bin/env node
// Author self-test on the Windows host (from WSL2): builds the app, stages it in the Windows temp
// directory, starts it with the official Windows Electron runtime in self-test mode, and collects its
// report and screenshots (this app's own windows only) into docs/verification/web/evidence.
//
// The run shows this app's windows briefly on the primary display and captures that display in memory
// for a few seconds; the report keeps non-content facts only. The user's cursor is never moved. Test ink
// is written to a temporary user-data folder that is removed afterwards.
//
// Usage: node scripts/self-test.mjs [--out <dir>]

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { APP, buildAndStage, copyTree, psq, toWin } from './windows-stage.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const outDir = resolve(args.out ?? join(APP, '..', '..', 'docs', 'verification', 'web', 'evidence'));
const { stage, electron } = buildAndStage('lc-windows-selftest');
const report = join(stage, 'report', 'windows-selftest.json');
const ps = [
  `$env:LC_SELFTEST=${psq(toWin(report))}`,
  `$env:LC_USER_DATA=${psq(toWin(join(stage, 'userdata')))}`,
  `$p = Start-Process -FilePath ${psq(electron)} -ArgumentList ${psq(`"${toWin(stage)}"`)} -PassThru`,
  `if (-not $p.WaitForExit(180000)) { Stop-Process -Id $p.Id -Force; Write-Output 'timed out' }`,
].join('; ');
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { cwd: '/mnt/c', encoding: 'utf8' });
if (result.stdout.trim()) console.log(result.stdout.trim());
if (!existsSync(report)) {
  console.error('no report was written');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
copyTree(join(stage, 'report'), outDir);
rmSync(stage, { recursive: true, force: true });
const r = JSON.parse(readFileSync(join(outDir, 'windows-selftest.json'), 'utf8'));
for (const c of r.checks ?? []) console.log(`${c.pass ? 'pass' : 'FAIL'} ${c.id}`);
if (r.error) console.log(`error: ${r.error}`);
console.log(`windows self-test passed ${r.summary.passed}/${r.summary.total}; failed: ${r.summary.failed.join(', ') || 'none'}`);
process.exitCode = r.summary.failed.length === 0 && !r.error ? 0 : 1;
