# Candidate09 integration and offline preparation — 2026-10-20

QA `76606babfacabf3558ee3ee3aa0cb7d1ceedec63` integrates as `86082f8`;
independent Support `cf83b67b49e11b229b68086d0ec7d65d355896e1` as `13cea54`.
Actual deliveries: `handoff_97d13fe0e4e90b64de2dd7e03d90a5a4` and
`handoff_53b498a5f013e704a2ae87dca54d1ae8`. Support's READY verdict covers the
offline source/pin delta only. [Independent review](../../../../support/candidate09-76606ba-review-20261020/README.md).

Lead read the actual delta and all commands. All six payloads equal Candidate08
after only scratch/copy substitutions; surface/checker are byte-identical.
All 21 source pins match. Wrapper changes only its candidate directory and pins,
preserving the diagnostic reader and time, source, window, 16-point, identity,
cleanup and request-accounting guards. The product remains `0ff325b` / 81 files;
connector source is the separately released `260884e`. Its
[hosted run](https://github.com/Judithandprey/ai-learning-companion/actions/runs/39430820878)
passed both Python versions; the 3.12 log has 7022 passed / 20 xfailed and no
previous unraisable teardown warning. That observation does not establish the
original warning's allocating test or Candidate08's failure cause.

## Actual integrated checks

At `13cea54`, the existing focused Node module passes **56/56 in 2155.56 ms**.
Node 24.21.0 used filesystem read grants only and `--test-isolation=none`,
with child processes and writes withheld. [Raw output](node.txt).
The complete integration diff whitespace check passes.

Lead separately approved and executed the candidate's existing
`qa_live_candidate.mjs prepare-connector` path after checking that the new
destination did not exist, including as a dangling symlink, and its parent was
not redirected. It creates only this new candidate-specific directory (0700),
leaving the old copy and all product/user state unchanged. Result:

- All **282 files** match released `services/` and `packages/`: no missing,
  differing or extra files.
- Offline ASK preparation succeeds with a generated 2×2 image and nine project
  modules from that copy.
- Offline live imports succeed with 13 project modules from that copy.
- No installed Codex, account, network, Windows process, display, microphone,
  playback or TTS was invoked.

[Preparation output](connector-prepare.json), [exact source/pins and checks](checks.json).
The earlier author/reviewer statements that the copy was absent remain accurate
at their timestamps; this Lead operation closes that preparation dependency.
No product or cached Electron stage was copied or launched.

## Concrete remaining boundary

The [reviewed command](../../../../qa/p0-13-live-0ff325b/candidate-nonvoice-09/driver/command.json)
and [inactive allocation template](../../../../qa/p0-13-live-0ff325b/candidate-nonvoice-09/driver/allocation.template.json)
are prepared. Candidate SHA-256:
`9dad7058fa43becf5c76f76f816e85646a014af8a6398e377d33f62c2e73c5cf`;
wrapper: `7023257e0739787744a3a60a36cf5cc038e1f10ebdeb91b0e9dedda9c9ef3594`.

Lead must receive a **new human decision for one real nonvoice attempt** before
current runtime/display/account admission, a fresh exclusive allocation and
dispatch to original QA. The proposed scope remains the reviewed observation →
automatic circle focus → changed generated page with typed follow-up → Stop
sequence: at most four actions/submissions, one 60-second session, at most
600 seconds foreground (360 seconds native), no retry. Only generated content
and the existing official subscription; no new billing, microphone, playback,
TTS, global policy or role-setting change. Exact-owned cleanup and explicit
DISPLAY/ACCOUNT release remain required.

Candidate08's single native attempt and 1/4 actions stay consumed and retired;
the three unused slots confer no retry. No new allocation or request was made.
The PowerShell parser was not rerun: the sole runner change is a validated
32-hex scratch name inside the same quoted string, equal to the previously
parsed source after substitution. Actual runtime checks still belong to any
future admitted execution, not this offline result.

The actual prior failure remains **unknown**. The updated private diagnostics
can distinguish future failure branches; they cannot reconstruct the missing
old facts. Full live screen/focus/voice and Mac acceptance remain open.
QA's supported permission-mode restoration remains operator-owned under the
existing manual-phase conditions; this delivery changes no mode or approval.
