# Actual display diagnostic attempt — 2026-10-07

**BLOCKED before native launch.** The exact reviewed wrapper was invoked once under the Lead-issued exclusive display-only allocation. Normal command review accepted it. It exited with code 1 at the preflight conflict guard (line 89): `another launch or debugging-port owner present; nothing started`. This is an admission conflict, with no established production defect or device acceptance result.

The executed QA baseline was `1e18a5100494335edf592f64e60a59727fbcdbd0`; production was `52be105a148a28e677f83cc4b7077665f2ff372c`, with Lead wrapper review at `e20229f`. Assignment `handoff_3d2a3a342f1406de8103d684dfbe3072` supplied the updated human continuation reference `human-interactive-resume-20261007:6e1744183d4548619cf4ce4b29a0e37f` and the exact allocation hash. The older candidate files remain unchanged preparation records; current authority came from the separate assignment/allocation.

The [issued allocation](allocation-as-issued.json) covered 07:40:28–08:10:28 UTC, exclusive display only, one native attempt bounded to 140 seconds, no retry, account, provider, microphone or audio access. Its saved `state: active` is the original issued record, not a current lease. **DISPLAY RELEASE at 07:44:21 UTC was accepted as native message `handoff_876cad3c8b3ed17383853a0218230c07`; Lead subsequently recorded that release in `handoff_d6346bd3b86d35e270077b49eaa9ea94`.**

## Steps and actual result

1. The exact foreground command in [attempt.json](attempt.json) ran once. [wrapper-terminal-output.txt](wrapper-terminal-output.txt) preserves the complete combined terminal output copied verbatim from the tool result, without inventing separate stdout/stderr streams.
2. The pinned call flow and observed line-89 exception show that candidate/payload admission, allocation admission, the fresh Linux stage identity check, the unused-scratch check and both Windows read-only preflight look calls returned before refusal. Their raw identity receipt and Windows snapshots were not saved by this early throw path.
3. The guard combines occupied app port 43123, occupied Edge port 45123, and a non-child or unreadable Electron launch. **The specific predicate, PID, port and owner from this first observation are UNKNOWN.** A later observation cannot reconstruct that discarded snapshot.
4. The Edge availability check, output/scratch creation, runner parsing, `RemoteSigned -File` invocation, native display admission and all 32 runner steps were not reached. [steps-status.json](steps-status.json) marks every original step NOT_RUN. No product window, generated Edge window, capture, drag, circle, Stop or speech was exercised.
5. No owned Electron/Edge roots were launched, so no owned cleanup signal was needed or sent. The wrapper cleanup block was not entered. No foreign process was signalled; this does not establish that unrelated processes or all child processes had exited.

This evidence directory was created by QA **after the failure** to salvage the issued allocation and tool output. The wrapper created neither this directory nor `run.json`, runner logs or native scratch. One subsequent Linux path-existence check found the candidate scratch still absent. The actual invocation consumed one wrapper attempt, with **native `-File` attempts 0**; that count does not grant permission to retry.

Real requests remain **0/4**, the voice-input slot is unassigned and unspent, the retired selected-image allowance stays retired, and the existing `ai` automation stays paused. Account, microphone, audio and the speech helper were not accessed or executed. No macOS, physical-input, actual speech, caption synchronization, real-AI or full desktop acceptance claim follows from this result.

## Next owner and preserved boundary

Lead owns coordination of the conflict and any future exact-candidate allocation. The subsequent bounded assignment `handoff_d6346bd3b86d35e270077b49eaa9ea94` asks QA to preserve sanitized preflight refusal metadata and permits one separate read-only metadata observation; it assigns **no second native execution**. This first-attempt evidence is committed before that correction and will not be rewritten to substitute later snapshots. No bypass, foreign termination or automatic retry is assigned.

[artifacts.json](artifacts.json) indexes the original evidence bytes and pinned source/candidate identities. All prior candidate/source pins and original offline evidence remain preserved.
