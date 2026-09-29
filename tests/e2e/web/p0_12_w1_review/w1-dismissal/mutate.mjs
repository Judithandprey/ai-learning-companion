// Targeted mutations of the W-1 guards in apps/safari-extension/src/page.ts.
// Each mutation is applied alone to a fresh copy; then the module's unit tests and probes.mjs run.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = '/tmp/qa-71f/work/w1-dismissal';
const PAGE = 'apps/safari-extension/src/page.ts';
const M = {
  M1_close_keeps_pendingCardGen: ['    card.hidden = true;\n    pendingCardGen = null;\n    highlight = null;', '    card.hidden = true;\n    highlight = null;'],
  M2_close_no_presentGen_bump_F4b: ['    presentGen += 1;\n    frameAsk = null;\n  };\n  close.addEventListener', '    frameAsk = null;\n  };\n  close.addEventListener'],
  M3_new_ask_keeps_pending_card: ["      if (pendingCardGen !== null) {\n        card.hidden = true;\n        pendingCardGen = null;\n      }\n", ''],
  M4_renderCard_keeps_pendingCardGen: ["    card.hidden = false;\n    pendingCardGen = null;\n    card.classList.remove('pending');", "    card.hidden = false;\n    card.classList.remove('pending');"],
  M5_renderCard_keeps_pending_class: ["    pendingCardGen = null;\n    card.classList.remove('pending');\n", '    pendingCardGen = null;\n'],
  M6_no_pending_card_on_submit: ["    if (options.role === 'top') showPending(gen, snapshot.selection.text);\n", ''],
  M7_pending_card_in_frames_too: ["    if (options.role === 'top') showPending(gen, snapshot.selection.text);", '    showPending(gen, snapshot.selection.text);'],
  M8_clearPending_ignores_generation: ['    if (pendingCardGen !== gen) return;\n', ''],
  M8b_clearPending_any_pending_gen: ['    if (pendingCardGen !== gen) return;\n', '    if (pendingCardGen === null) return;\n'],
  M9_then_never_clears_pending: ['        clearPending(gen);\n      })\n      .catch', '      })\n      .catch'],
  M10_catch_never_clears_pending: ["        emit({ type: 'ask', outcome: 'empty_geometry', presented: false, detail: { error: String(error) } });\n        clearPending(gen);\n", "        emit({ type: 'ask', outcome: 'empty_geometry', presented: false, detail: { error: String(error) } });\n"],
  M11_pending_keeps_old_highlight: ['    highlight = null;\n    placeHighlight();\n    renderCard({\n', '    renderCard({\n'],
  M12_no_generation_check_F4: ['        const current = gen === presentGen;', '        const current = true;'],
  M13_close_keeps_frameAsk: ['    presentGen += 1;\n    frameAsk = null;\n  };\n  close.addEventListener', '    presentGen += 1;\n  };\n  close.addEventListener'],
  M14_clearPending_does_not_hide: ['    if (pendingCardGen !== gen) return;\n    card.hidden = true;\n', '    if (pendingCardGen !== gen) return;\n'],
  M15_presented_ignores_not_in_ask: ["          presented: current && outcome.status !== 'not_in_ask',", '          presented: current,'],
};

const only = process.argv.slice(2);
const out = {};
const NODE = process.execPath;
for (const [name, [from, to]] of Object.entries(M)) {
  if (only.length && !only.includes(name)) continue;
  const root = path.join(BASE, 'mut', name);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'apps'), { recursive: true });
  fs.cpSync(path.join(BASE, 'apps/safari-extension'), path.join(root, 'apps/safari-extension'), { recursive: true });
  const file = path.join(root, PAGE);
  const text = fs.readFileSync(file, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) { out[name] = { error: `locator matched ${count} times` }; continue; }
  fs.writeFileSync(file, text.replace(from, to));
  const unit = spawnSync(NODE, ['--test', '--test-isolation=none', ...fs.readdirSync(path.join(root, 'apps/safari-extension/tests')).filter((f) => f.endsWith('.test.ts')).map((f) => `tests/${f}`)], { cwd: path.join(root, 'apps/safari-extension'), encoding: 'utf8' });
  const pass = /ℹ pass (\d+)/.exec(unit.stdout)?.[1];
  const fail = /ℹ fail (\d+)/.exec(unit.stdout)?.[1];
  const probe = spawnSync(NODE, [path.join(BASE, 'probes.mjs')], { cwd: BASE, env: { ...process.env, W1_ROOT: root }, encoding: 'utf8' });
  const summary = /CHECKS (\d+\/\d+) passed/.exec(probe.stdout)?.[1];
  const failed = /FAILED (.*)/.exec(probe.stdout)?.[1]?.split(' ') ?? [];
  out[name] = { unit: `${pass} pass / ${fail} fail`, probes: summary, probeFailures: failed, probeErr: probe.stderr.trim().split('\n').slice(-2).join(' | ') || undefined };
  console.log(name, JSON.stringify(out[name]));
}
fs.writeFileSync(path.join(BASE, 'mutation-results.json'), JSON.stringify(out, null, 2));
