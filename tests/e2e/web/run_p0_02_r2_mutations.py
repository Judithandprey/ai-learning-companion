"""QA mutation check for the P0-02 round-2 web fixes F1-F6 (not collected by pytest).

Each mutation is QA's own minimal revert of one fix, applied to a temporary copy of
apps/safari-extension (plus the generated contract types it imports). The unchanged
unit tests and, for DOM-level fixes, the unchanged desktop browser self-test are then
run. A regression is adequate only if it fails without its fix. Two extra mutations
(F2b, F4b) remove secondary guards to measure what the existing tests do not cover.
W1a-W1f (added for the W-1 re-test at 71f1389) remove or weaken the pending-card and
dismissal guards introduced by W-1.

Usage (foreground; uses the lead-allocated port 4173 and a temporary Edge profile):
  python3 tests/e2e/web/run_p0_02_r2_mutations.py <out-dir> [mutation-id ...]
Requires Node 24.21.0/TypeScript 7.0.2 from the lead's pinned toolchain and, for
browser rows, Windows Edge reachable from WSL. Desktop synthetic events only.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
# QA_TARGET_ROOT runs the mutations against another exact tree (e.g. a /tmp export
# of an integrated main commit) without touching this worktree.
ROOT = Path(os.environ.get("QA_TARGET_ROOT", ROOT)).resolve()
MODULE = ROOT / "apps/safari-extension"
LEAD = Path(os.environ.get("LC_LEAD_REPO", "/home/agentsdock/Projects/learning-companion/repo"))
NODE_BIN = LEAD / ".tools/node-v24.21.0-linux-x64/bin"
TSC = ROOT / "node_modules/typescript/bin/tsc"
EDGE = os.environ.get("BROWSER", "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")

# The early pointercancel block (restores a set-aside selection since QA-P07-01 fix 6c3c1b6).
F1_NEW = """    // An aborted gesture submits nothing, whatever kind of mark it was.
    if (e.type === 'pointercancel') {
      if (pendingText && e.pointerId === pendingText.pointerId) {
        const { previous } = pendingText;
        pendingText = null;
        if (previous) restoreSelection(win, previous); // nothing was marked: the set-aside selection is put back
        emit({ type: 'capture_aborted', reason: 'pointer_cancelled' });
      }
      if (active && e.pointerId === active.pointerId) {
        e.preventDefault();
        e.stopImmediatePropagation();
        abortCapture();
      }
      return;
    }
"""
F1_TAIL_OLD = """    if (!active || e.pointerId !== active.pointerId) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const c = active;"""
F1_TAIL_NEW = """    if (!active || e.pointerId !== active.pointerId) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'pointercancel') {
      abortCapture();
      return;
    }
    const c = active;"""

MUTATIONS = {
    "CONTROL": {"layer": "browser", "describe": "no mutation: harness control, must pass everything", "edits": []},
    "F1": {"layer": "browser", "describe": "pointercancel handled only after the pending mouse text selection (127bd4c order)",
           "edits": [("src/page.ts", F1_NEW, ""), ("src/page.ts", F1_TAIL_OLD, F1_TAIL_NEW)]},
    "F2": {"layer": "browser", "describe": "frame card accepted without an authorized completed frame ASK",
           "edits": [("src/page.ts", "const authorized = frameAsk !== null && frameAsk.source === e.source && data['askEpoch'] === frameAsk.epoch && session.state.askEpoch === frameAsk.epoch;",
                      "const authorized = true;")]},
    "F2b": {"layer": "browser", "describe": "authorized frame card no longer consumed (a second card for the same ASK would be accepted)",
            "edits": [("src/page.ts", "        return;\n      }\n      frameAsk = null;\n      // The top renders its own text",
                       "        return;\n      }\n      // The top renders its own text")]},
    "F3": {"layer": "browser", "describe": "adjust confirm re-reads the live page at confirm time instead of the mark-time state",
           "edits": [("src/page.ts", "    const snapshot = snapshotFromMark(adjustMark, atMark);",
                      "    const o2 = host.getBoundingClientRect();\n"
                      "    const live = { x: adjustRect.x + o2.left, y: adjustRect.y + o2.top, width: adjustRect.width, height: adjustRect.height };\n"
                      "    const region = textInRegion(doc, live, null, host);\n"
                      "    const snapshot = captureSnapshot(win, live, region.text, region.container, options.documentVersion(), session.now());\n"
                      "    void snapshotFromMark;")]},
    "F4": {"layer": "browser", "describe": "presentation generation not checked after the bridge await",
           "edits": [("src/page.ts", "const current = gen === presentGen;", "const current = true; void gen;")]},
    "F4b": {"layer": "browser", "describe": "card dismissal no longer retires pending results",
            "edits": [("src/page.ts", "    placeHighlight();\n    presentGen += 1;\n    frameAsk = null;\n  };\n  close.addEventListener('click', closeCard);",
                       "    placeHighlight();\n    frameAsk = null;\n  };\n  close.addEventListener('click', closeCard);")]},
    "W1a": {"layer": "browser", "describe": "W-1: a top submission no longer shows its own pending card",
            "edits": [("src/page.ts", "    if (options.role === 'top') showPending(gen, snapshot.selection.text);\n", "")]},
    "W1b": {"layer": "browser", "describe": "W-1: starting a new ASK leaves the retired pending card on screen",
            "edits": [("src/page.ts", "      // The pending request was just retired; its pending card must not linger.\n      if (pendingCardGen !== null) {\n        card.hidden = true;\n        pendingCardGen = null;\n      }\n", "")]},
    "W1c": {"layer": "browser", "describe": "W-1: a pending card is not removed when its outcome has nothing to show",
            "edits": [("src/page.ts", "        // Nothing to show (e.g. the ASK was cancelled while hashing): remove the pending card.\n        clearPending(gen);\n", "")]},
    "W1d": {"layer": "browser", "describe": "W-1: starting a new ASK no longer retires the pending generation",
            "edits": [("src/page.ts", "    if (mode === 'ASK' && askEpoch !== lastAskEpochSeen) {\n      presentGen += 1;\n", "    if (mode === 'ASK' && askEpoch !== lastAskEpochSeen) {\n")]},
    "W1e": {"layer": "browser", "describe": "W-1: the pending card falsely claims an explanation",
            "edits": [("src/page.ts", "'Preparing a silent card for this selection. Nothing has been explained yet.'", "'Explanation: this selection is explained below.'")]},
    "W1f": {"layer": "browser", "describe": "W-1: clearing a pending card ignores which submission it belongs to",
            "edits": [("src/page.ts", "    if (pendingCardGen !== gen) return;\n", "    if (pendingCardGen === null) return;\n")]},
    "F5a": {"layer": "unit", "describe": "selection created_at taken after the hash await",
            "edits": [("src/session.ts", "    const createdAt = clock(); // before any await\n    const frozen = await freezeDomSnapshot(snapshot, identity, source, ids);",
                       "    const frozen = await freezeDomSnapshot(snapshot, identity, source, ids);\n    const createdAt = clock();")]},
    "F5b": {"layer": "unit", "describe": "frame captured_at read from the wall clock after hashing",
            "edits": [("src/frame.ts", "    captured_at: payload.captured_at,", "    captured_at: new Date().toISOString(),")]},
    "F6": {"layer": "unit", "describe": "eigenvector fixture text restored to 'keeps its direction'",
           "edits": [("src/fixture-data.ts",
                      "      'Synthetic fixture: a nonzero eigenvector v satisfies Av = λv, so the map only scales it by λ. A negative λ reverses its direction; λ = 0 sends it to the zero vector. (特征向量：Av = λv，只被 λ 缩放；λ < 0 时反向，λ = 0 时变为零向量。)',",
                      "      'Synthetic fixture: an eigenvector keeps its direction under the map; only its length is scaled by the eigenvalue. (特征向量：方向不变，只被缩放。)',")]},
}


def run(cmd, cwd, env):
    result = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=600)
    return result.returncode, result.stdout + result.stderr


def prepare(work):
    if work.exists():
        shutil.rmtree(work)
    shutil.copytree(MODULE, work / "apps/safari-extension", ignore=shutil.ignore_patterns("dist", "node_modules"))
    shutil.copytree(ROOT / "packages/contracts/generated", work / "packages/contracts/generated")
    shutil.copy(ROOT / "package.json", work / "package.json")
    return work / "apps/safari-extension"


def unit_summary(output):
    lines = [l for l in output.splitlines() if l.startswith("ℹ ") or l.startswith("✖ ") or "not ok" in l]
    failed = [l[2:].strip() for l in output.splitlines() if l.startswith("✖ ") and "failing tests" not in l]
    return {"tail": lines[-8:], "failed": sorted(set(failed))}


def main():
    out = Path(sys.argv[1]).resolve()
    selected = sys.argv[2:] or list(MUTATIONS)
    out.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "PATH": f"{NODE_BIN}:{os.environ['PATH']}"}
    results = {}
    for mid in selected:
        m = MUTATIONS[mid]
        module = prepare(Path("/tmp/qa-p0-02/mut") / mid)
        for rel, old, new in m["edits"]:
            path = module / rel
            text = path.read_text()
            assert text.count(old) == 1, f"{mid}: mutation site not unique in {rel}"
            path.write_text(text.replace(old, new))
        row = {"describe": m["describe"], "layer": m["layer"]}
        code, output = run(["node", str(TSC), "-p", "tsconfig.json"], module, env)
        row["typecheck_exit"] = code
        code, output = run(["node", "--test", "--test-reporter=spec", *sorted(str(p.name) for p in (module / "tests").glob("*.test.ts"))], module / "tests", env)
        row["unit_exit"] = code
        row["unit"] = unit_summary(output)
        if m["layer"] == "browser":
            code, output = run(["node", str(TSC), "-p", "tsconfig.build.json"], module, env)
            row["build_exit"] = code
            run_id = f"qa-mut-{mid}"
            code, output = run(["node", "scripts/browser-check.mjs", "--browser", EDGE, "--out", str(out), "--run", run_id], module, env)
            row["browser_exit"] = code
            report_path = out / f"{run_id}.json"
            if report_path.exists():
                report = json.loads(report_path.read_text())
                summary = report.get("summary", {})
                row["selftest"] = {"total": summary.get("total"), "passed": summary.get("passed"),
                                   "failed": [c["id"] for c in report.get("checks", []) if c.get("pass") is False]}
            else:
                row["selftest"] = None
                row["browser_tail"] = output.splitlines()[-6:]
        results[mid] = row
        print(mid, json.dumps({k: v for k, v in row.items() if k != "describe"}, ensure_ascii=False))
        shutil.rmtree(Path("/tmp/qa-p0-02/mut") / mid)
    (out / "qa-mutations.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
