"""QA regressions from the Web P0-12 retest at main 0c04b2e (node-only, test-only models).

The P0-12 disclosure and organize models are test-only engineering references, not a
production protocol. These checks run small Node scripts against them; they are skipped
when the pinned Node 24.21.0 is unavailable. Confirmed gaps are strict xfail.
Browser evidence (W1c/e/f mutations, EO-1 open-root dispatch) is recorded separately in
docs/verification/qa/p0-12-web-retest.md.
"""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
MODELS = ROOT / "apps/safari-extension/tests/p0-12"
LEAD = Path(os.environ.get("LC_LEAD_REPO", "/home/agentsdock/Projects/learning-companion/repo"))
PINNED = LEAD / ".tools/node-v24.21.0-linux-x64/bin/node"
NODE = str(PINNED) if PINNED.exists() else shutil.which("node")


def node_version():
    if NODE is None:
        return None
    return subprocess.run([NODE, "--version"], capture_output=True, text=True).stdout.strip()


pytestmark = pytest.mark.skipif(node_version() != "v24.21.0", reason="pinned Node 24.21.0 not available")

PRELUDE = f"""
const D = await import({str((MODELS / 'disclosure-model.ts').as_uri())!r});
const O = await import({str((MODELS / 'organize-model.ts').as_uri())!r});
const B = {{ problemId: 'p1', problemVersion: 1, attemptId: 'a1' }};
const R = (id, level, origin = 'other_device', scope = null) => ({{ id, level, scope, origin }});
const item = (c, id, level, requestId) => ({{ id, channel: 'card', ...B, basisRevision: c.attemptRevision,
  requestId, level, scope: null, preferenceKey: D.preferenceKey(c), derivedFrom: [] }});
const run = (events, c0 = D.apply(D.initialContext('p0', 1, 'a0'), {{ type: 'enter_problem', ...B }})) =>
  events.reduce((c, e) => D.apply(c, e), c0);
const remote = (v, request) => ({{ type: 'remote_policy', binding: B, policyVersion: v, teaching: request ? 'help' : 'explore', request }});
const reconnect = (v, request) => ({{ type: 'reconnect', binding: B, policyVersion: v, teaching: request ? 'help' : 'explore',
  request, acceptedProvisional: [], acknowledgedClose: false }});
"""


def node(body, cwd=ROOT):
    result = subprocess.run([NODE, "--input-type=module", "-e", PRELUDE + body], cwd=cwd, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stderr[-2000:]
    return result.stdout.strip().splitlines()


def test_d1_connected_restriction_is_not_undone_by_a_same_version_reconnect():
    lines = node("""
const sol = R('rr-sol', 'full_solution');
for (const events of [
  [remote(1, sol), { type: 'let_me_try' }, { type: 'disconnect' }, reconnect(1, sol)],
  [remote(1, sol), { type: 'let_me_try' }, remote(2, sol)],
  [remote(1, sol), { type: 'request', request: R('r-mine', 'key_concept', 'this_device') }, { type: 'disconnect' }, reconnect(1, sol)],
]) { const c = run(events); console.log(D.decide(c, item(c, 'sol', 'full_solution', 'rr-sol')).present); }
const later = run([remote(1, sol), { type: 'disconnect' }, { type: 'let_me_try' }, reconnect(1, sol),
  { type: 'request', request: R('r-mine', 'key_concept', 'this_device') },
  remote(2, R('r-mine', 'key_concept', 'this_device')), remote(3, R('rr-later', 'full_solution'))]);
console.log('liveness', D.decide(later, item(later, 'later', 'full_solution', 'rr-later')).present);
""")
    assert lines == ["false", "false", "false", "liveness true"]


@pytest.mark.xfail(strict=True, reason="WEB-DISCLOSURE-01: switching attempts resets attemptRevision to 0, so a pre-correction "
                                       "cached hint is presented again after leaving and returning (A34, plan rules 1/10)")
def test_a_correction_still_invalidates_older_help_after_leaving_and_returning():
    lines = node("""
const P2 = { problemId: 'p2', problemVersion: 1, attemptId: 'a2' };
let c = run([{ type: 'request', request: R('r1', 'key_concept', 'this_device') }]);
const hint0 = item(c, 'hint-rev0', 'key_concept', 'r1');
c = run([{ type: 'attempt_revised', revision: 1 }, { type: 'enter_problem', ...P2 }, { type: 'enter_problem', ...B },
  { type: 'request', request: R('r3', 'key_concept', 'this_device') }], c);
console.log(c.attemptRevision, D.cacheHit(c, c.activeRequest, [hint0])?.id ?? null);
""")
    assert lines == ["1 null"]


def test_org1_refusals_are_per_question_and_org3_effect_evidence_is_never_none():
    lines = node("""
let r = O.answerPrompt(O.initialPromptState, 'finished_confident', 'q1');
const q1 = r.promptId;
r = O.answerPrompt(r.state, 'still_editing', 'q2');
const st = O.decline(r.state, q1, 'ipad#1');
console.log(O.answerPrompt(st, 'finished_confident', 'q2').decision, O.answerPrompt(st, 'finished_confident', 'q1').decision,
  O.reopen(O.decline(st, q1, 'iphone#1'), 'q1', ['ipad#1']).allowed);
for (const ev of [['prepared', 'panel_opened', 'dispatch_completed'], ['prepared', 'panel_opened', 'target_import_confirmed'],
  ['prepared', 'panel_opened', 'cancelled_before_dispatch', 'dispatch_started'],
  ['prepared', 'panel_opened', 'failed_before_dispatch', 'dispatch_completed']])
  console.log(O.externalExposure(ev, true).exposure, O.reportExport(ev).everImported);
console.log('control', O.externalExposure(['prepared', 'panel_opened', 'no_response'], true).exposure);
""")
    assert lines == ["ask_organize no_prompt false", *["possible false"] * 4, "control none"]


ORGANIZE_MUTANTS = {
    # WEB-ORGANIZE verifier (medium): the per-layer disclosure check is pinned only with one-layer manifests.
    "permitted_now_first_layer_only": ("    if (!l.permittedNow) reasons.push(`layer_not_permitted_now:${l.id}`);",
                                       "    if (!l.permittedNow && l === m.aiLayers[0]) reasons.push(`layer_not_permitted_now:${l.id}`);"),
    # WEB-ORGANIZE verifier (medium): ORG-3 exposure evidence is pinned only for sampled event/state pairs.
    "failure_is_final": ("      case 'dispatch_started':\n",
                         "      case 'dispatch_started':\n        if (cur === 'failed_before_dispatch') break;\n"),
}


@pytest.mark.parametrize("mutant", sorted(ORGANIZE_MUTANTS))
@pytest.mark.xfail(strict=True, reason="organize coverage gaps: these consequential regressions pass all 17 organize tests")
def test_organize_tests_catch_consequential_mutants(tmp_path, mutant):
    old, new = ORGANIZE_MUTANTS[mutant]
    shutil.copytree(ROOT / "apps", tmp_path / "apps", ignore=shutil.ignore_patterns("dist", "node_modules"))
    shutil.copytree(ROOT / "packages", tmp_path / "packages", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy(ROOT / "package.json", tmp_path)
    model = tmp_path / "apps/safari-extension/tests/p0-12/organize-model.ts"
    text = model.read_text()
    assert text.count(old) == 1
    model.write_text(text.replace(old, new))
    result = subprocess.run([NODE, "--test", "--test-isolation=none", "apps/safari-extension/tests/p0-12-organize.test.ts"],
                            cwd=tmp_path, capture_output=True, text=True, timeout=300)
    assert result.returncode != 0, "mutant survived the unchanged organize tests"
