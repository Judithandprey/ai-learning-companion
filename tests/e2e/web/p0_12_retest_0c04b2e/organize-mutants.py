import os, shutil, subprocess, sys
from pathlib import Path
SRC = Path("/tmp/qa-0c0/repo"); NODE = "/tmp/qa-0c0/repo/.tools/node-v24.21.0-linux-x64/bin/node"
MUTS = {
    "CONTROL": None,
    "L5_permittedNow_first_layer_only": ("    if (!l.permittedNow) reasons.push(`layer_not_permitted_now:${l.id}`);",
                                         "    if (!l.permittedNow && l === m.aiLayers[0]) reasons.push(`layer_not_permitted_now:${l.id}`);"),
    "NA_failure_is_final": ("      case 'dispatch_started':\n",
                            "      case 'dispatch_started':\n        if (cur === 'failed_before_dispatch') break;\n"),
}
for name, edit in MUTS.items():
    root = Path(name); shutil.rmtree(root, ignore_errors=True)
    shutil.copytree(SRC / "apps", root / "apps"); shutil.copytree(SRC / "packages", root / "packages"); shutil.copy(SRC / "package.json", root)
    model = root / "apps/safari-extension/tests/p0-12/organize-model.ts"
    if edit:
        text = model.read_text(); assert text.count(edit[0]) == 1, name; model.write_text(text.replace(edit[0], edit[1]))
    r = subprocess.run([NODE, "--test", "--test-isolation=none", "apps/safari-extension/tests/p0-12-organize.test.ts"], cwd=root, capture_output=True, text=True, timeout=300)
    tail = [l for l in r.stdout.splitlines() if l.startswith(("ℹ pass", "ℹ fail"))]
    probe = f"""
import {{ mayDispatch, externalExposure }} from './apps/safari-extension/tests/p0-12/organize-model.ts';
console.log('two-layer manifest, correction not permitted now:', JSON.stringify(mayDispatch({{ id: 'm', userLayers: ['a'], aiLayers: [{{ id: 'L1', kind: 'layout', permittedNow: true }}, {{ id: 'C1', kind: 'correction', permittedNow: false }}] }}, {{ manifestId: 'm', previewedAiLayerIds: ['L1', 'C1'], scope: 'content' }})));
console.log('[prepared,panel_opened,failed_before_dispatch,dispatch_started] exposure:', externalExposure(['prepared','panel_opened','failed_before_dispatch','dispatch_started'], true).exposure);
"""
    (root / "effect.ts").write_text(probe)
    e = subprocess.run([NODE, "effect.ts"], cwd=root, capture_output=True, text=True, timeout=60)
    print(name, "| tests:", " ".join(tail), "| exit", r.returncode, "\n   ", e.stdout.strip().replace("\n", "\n    "), e.stderr.strip()[-200:])
