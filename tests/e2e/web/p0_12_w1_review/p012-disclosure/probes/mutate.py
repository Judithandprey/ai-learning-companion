#!/usr/bin/env python3
"""QA 06: single-point mutations of the TEST-ONLY disclosure model, each run against the
unchanged tests/p0-12-disclosure.test.ts in a throwaway copy. Survivors = not detected."""
import os, shutil, subprocess, sys, json

W = '/tmp/qa-71f/work/p012-disclosure'
SRC = f'{W}/apps/safari-extension/tests'
NODE = '/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node'

M = {
  'MA stale snapshot widens local request level while close unacked': (
    "return request === null ? { ...closed(base), teaching } : base;",
    "return request === null ? { ...closed(base), teaching } : base.activeRequest ? { ...base, permission: { level: request.level, scope: request.scope }, activeRequest: { ...base.activeRequest, level: request.level, scope: request.scope } } : base;"),
  'MB accepted provisional request escalated to full_solution': (
    "activeRequest: { ...local, provisional: false } };",
    "activeRequest: { ...local, provisional: false, level: 'full_solution' as Level }, permission: { level: 'full_solution' as Level, scope: null } };"),
  'MC disconnected voice threshold >= becomes >': (
    "rank(item.level) >= rank(HIGH_VOICE)", "rank(item.level) > rank(HIGH_VOICE)"),
  'MD cache may serve voice segments': (
    "      c.channel !== 'voice',\n", "      true,\n"),
  'ME decide drops item<=request-level check': (
    "if (rank(item.level) > rank(req.level) || rank(item.level) > rank(ctx.permission.level))",
    "if (rank(item.level) > rank(ctx.permission.level))"),
  'MF decide drops item<=permission-level check': (
    "if (rank(item.level) > rank(req.level) || rank(item.level) > rank(ctx.permission.level))",
    "if (rank(item.level) > rank(req.level))"),
  'MG connected let_me_try clears an unsynced close': (
    "pendingClose: ctx.pendingClose || ctx.sync !== 'fresh'", "pendingClose: ctx.sync !== 'fresh'"),
  'MH local request while close unacked does not keep base on stale snapshot (uses snapshot request)': (
    "return request === null ? { ...closed(base), teaching } : base;",
    "return request === null ? { ...closed(base), teaching } : base.activeRequest ? { ...withRequest(base, request, false), teaching } : base;"),
  'MI reconnect accepts equal version only (<= instead of <)': (
    "if (!matches || e.policyVersion < ctx.policyVersion) return settled;",
    "if (!matches || e.policyVersion <= ctx.policyVersion) return settled;"),
  'MJ step-check scope rule only for step_check items': (
    "if (req.scope !== null && rank(item.level) > 0 && item.scope !== req.scope)",
    "if (req.scope !== null && item.level === 'step_check' && item.scope !== req.scope)"),
  'MK request_for_another_attempt check removed': (
    "if (req.problemId !== ctx.problemId || req.problemVersion !== ctx.problemVersion || req.attemptId !== ctx.attemptId) return no('request_for_another_attempt');",
    ""),
  'ML accepted provisional ignores binding match': (
    "if (local && local.provisional && matches && e.acceptedProvisional.includes(local.id))",
    "if (local && local.provisional && e.acceptedProvisional.includes(local.id))"),
}

results = {}
for name, (old, new) in M.items():
    d = f'/tmp/qa-71f/work/p012-disclosure/mut/{name.split()[0]}'
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(f'{d}/tests/p0-12')
    shutil.copy(f'{SRC}/p0-12-disclosure.test.ts', f'{d}/tests/')
    shutil.copy(f'{SRC}/p0-12/disclosure-traces.json', f'{d}/tests/p0-12/')
    s = open(f'{SRC}/p0-12/disclosure-model.ts').read()
    assert s.count(old) == 1, (name, s.count(old))
    open(f'{d}/tests/p0-12/disclosure-model.ts', 'w').write(s.replace(old, new))
    p = subprocess.run([NODE, '--test', '--test-isolation=none', 'tests/p0-12-disclosure.test.ts'], cwd=d, capture_output=True, text=True)
    fails = [l.strip() for l in p.stdout.splitlines() if 'AssertionError' in l or l.strip().startswith('✖ P0')]
    results[name] = 'SURVIVED (tests pass)' if p.returncode == 0 else 'killed: ' + ' | '.join(dict.fromkeys(fails))[:220]
    print(f'{name}: {results[name]}')
