# Integrated output diagnostics — 2026-10-20

Backend `4e840a4b82896ded93d7844966bac60beaa47f22` → `e393e0d`,
QA `21668dd67b658893959ad469d636e1ffeec765d4` → `7b81981`.
Independent verdict: READY, received in
`handoff_bc192b74d440cb78e97f962897724a8c`.

The connector's private receipt now records bounded failure, completed-message
phase, terminal-view and answer-selection facts. QA reads exactly the complete
legacy or extended schema and publishes only validated diagnostic values. Neither
change alters answer selection, the public wire, submission/cancellation guards,
source admission or permissions. Commentary/reasoning do not become an answer;
observations remain silent. Prompt/image/answer/error prose and credentials are
not added to receipts.

Lead reviewed both source diffs, the real call paths and the independent
[QA evidence](../../../../qa/p0-13-live-0ff325b/receipt-diagnostics-4e840a4/README.md).
At integrated source `7b81981`:

- **107 passed in 3.98s**: `test_chatgpt_output_diagnostics.py`,
  `test_chatgpt_receipts.py`, `test_chatgpt_failure_outcomes.py`, using the existing
  virtual environment and synthetic Python children.
- **55/55 passed**: `tests/e2e/windows/test_qa_live_candidate.mjs`, Node 24.21.0,
  `--permission --test-isolation=none`; read grants only for the repository and
  the existing test scratch pattern, with child-process and write access withheld.
- Wrapper SHA-256:
  `dc10b044bd703bd502d1af40458a03cab893b97af9f7e2a52fbaa81964dbcead`;
  test SHA-256:
  `c6bb5f0aae9d12356fa008a9434c9f9862dad2b525fc4c9c860676ab589be63f`.
- Source/test/Markdown/JSON diff whitespace checks pass. The author's raw
  before-failure log retains two whitespace-only lines (72,83); full-tree
  `git diff --check` flags them. The evidence bytes were preserved.

[Exact checks and source equality](checks.json), [Python output](python.txt),
[Node output](node.txt).

The first Node invocation used the test runner's default child isolation and
was denied by Node's intentionally withheld child-process permission before
tests loaded. Running the same tests in the current process preserved that
restriction and passed. This was not a provider or tool-approval refusal.
No Windows, installed Codex, account, model, display, microphone, playback or
TTS was invoked. Owner's 636 connector passes and QA's independent metadata
probe are separately attributed in their reports, not additional Lead counts.

Candidate08's actual failure remains **unknown**: one native attempt and 1/4
actions consumed, DISPLAY/ACCOUNT released and its allocation retired.
The new diagnostics cannot retrospectively identify that branch. No candidate,
runtime, stage or runner pins were regenerated; no new live allocation exists.
Full screen/focus/voice flow and Mac actual-device acceptance remain open.

Lead next owns an exact new connector/candidate baseline before any separately
authorized real attempt. Backend delivered `4c5e071` for the narrow non-failing
Python 3.12 subprocess-teardown warning from main CI `39423782479`; its existing
handoff is `handoff_43ccd426e23914ad237d9dc3319def79`. Lead's exact-export check
passes 119 focused cases in 8.40s (246 deselected), treating unraisable warnings as
errors. Support independently reviews that delivery under
`handoff_efced72b704d037870c153100d3c1867` before integration. The reproduced
paused-pipe defect does not prove which case produced the old hosted warning.
QA's manual-stage restoration
still belongs to the operator after the recorded runtime checks; this offline
integration does not change its permission mode.
