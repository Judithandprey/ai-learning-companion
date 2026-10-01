# Managed subscription: measured macOS binary admission

2026-10-01 UTC. Backend continuation
`handoff_9b3310ff500df0caa3adef668de610b2`, assigned integrated baseline
`80bcd81e603eed14f0ab1c44dbe5b647e6e4cac9`.

The launcher now admits the exact measured Darwin arm64 Codex 0.158.0 executable,
while retaining the original Linux x86_64 pin. Admission requires the full
platform/architecture/hash combination; a matching version string or a hash
belonging to the other platform cannot pass. Other builds fail closed. No
authentication route, configuration, skills, thread policy, receipt gate,
dependency, IPC or unrelated disabled provider changed.

| Platform / architecture | Required executable SHA-256 |
| --- | --- |
| Linux / x86_64 | `167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9` |
| Darwin / arm64 | `788a818fbb9596869c7a487554507cb8bdca17584b8671112b23f9e225ba35c8` |

## Evidence used, not rerun

Read the exact assigned baseline's `docs/verification/lead/subscription-ask/`
`mac-metadata-hosted.json`, `mac-metadata-review.md` and complete ADR 0003.
The hosted receipt records actual macOS 26.6.2 arm64, official Codex 0.158.0,
source `de46212ac6c4800d8e0170c1ee4fe59f716a2de4`, and official archive hash
`341c4a08f9ce1935b3007376dc2a3d50a0a89112930e9a474ae61367218f6e8a`.
Lead identifies hosted run `36825904220`. The exact candidate's effective
configuration and all six disabled system skills passed; its only outbound
methods were initialize, initialized, config/read, configRequirements/read and
skills/list. Owned children were reaped and temporary state removed.

Backend independently matched all five receipt-bound source hashes against that
recorded Git revision. Before this change, the local launch/RPC/receipt source
matched the assigned integrated baseline. Read-only `git show` preserved the
worker branch; there was no unrelated baseline merge. Relevant source/English
requirements are unchanged from the previously read `1b7c905` revision, and all
four current manifest pairs verify. R38/§3.8/G4, managed OAuth ownership,
explicit ASK/Stop and the original-image acceptance boundaries remain intact.

The hosted probe checked the shared metadata verifier without calling the
production factory/admission function. It therefore supports adding this pin;
it does not establish an actual Mac production flow after the addition. This
author pass does not rerun Support's hosted campaign or download the binary.

## Verification

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/worker/connectors/tests/test_chatgpt_launch.py
```

**129 passed in 0.20s**; `git diff --check` passed. The unchanged RPC/Learning
suite is not rerun or counted as fresh evidence for this narrow admission change.

Focused launch tests exercise both exact pins, changed bytes, cross-platform
hashes, unknown platforms/architectures and the existing factory/configuration/
state guards. Platform/hash substitution is explicitly synthetic, with a
separate actual-byte hashing test; no Mac process is launched by these tests.

The locally installed Linux executable also passed the actual `_binary_identity`
read/hash check after this patch, returning the unchanged exact Linux hash and
`codex-cli 0.158.0`. That check does not execute the binary.

PONYTAIL LITE: one additional fixed digest and a two-entry platform/architecture
lookup reuse the existing verification path. No new layer or dependency.

Lead integrates this leaf and releases the exact connector to Native. A real
Mac production-factory check, managed login, model access, image understanding,
interactive device permissions and full product acceptance remain unverified.
First real image acceptance remains the separately coordinated Windows task;
this pass makes no account/login/model/thread/turn calls and spends no inference
allowance.
