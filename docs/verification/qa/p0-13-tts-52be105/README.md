# Current-response TTS: exact-package offline preparation

2026-10-03. Existing P0-07/P0-12/P0-13 continuation, assigned by
`handoff_4e8a3b554079777a3c4f701b6a69837b` and refined by
`handoff_58190bbd3a72c3aa712e7314bdb037df`. **Offline preparation complete;
actual output/device acceptance NOT_RUN.** No new concrete production source
conflict was established. This packet does not admit execution.

Production source is `52be105a148a28e677f83cc4b7077665f2ff372c`; the exact
release/evidence is `ad7bd72a8e902b366fbbb71d90f530c18043a251`.
QA read those Git objects without changing its baseline or production files.
Affected full original/English §7.1–7.3, current decisions, source/time cases,
AUDIO-08/09/14/15 and the exact task rows were refreshed. Specifications did not
change between the placement baseline and this release; task status did.
R09/R57/R60, A05/A06/A14/A47–49 and existing LIVE-07/08 remain the acceptance scope.

## Actual checks and evidence limits

[Static identity](stage-identity.json) independently reads the assigned stage:

- All **77 payload files** match the committed manifest; no missing, extra or
  nonregular entry. The subsequently written sidecar matches committed bytes.
- Tree: `531943a83d3572ca9c686c7d8cd62bd88da5b0401b84050487722b8e87a02669`.
- Entry `dist/apps/windows/src/main/main.js`:
  `9969b8afa2b3f3df82d3733c5d6e8adec5c34393af49d2d10c88704d68982128`.
- Bundled source, executable and local build receipt match the exact release.
  Executable: `21c7bed3fedcdefdccc2f45b799bfebb417df7a56f44f656523d303e7b349e10`.
  This is Lead's build; the author's memory-synthesis evidence used another binary.
- Cached Electron's recorded44.5.1 version and measured executable hash match
  the release. This is file identity, without independent distribution authentication.

[Focused checks](focused-checks.log) contain **16 passed offline admission
checks**, zero failure/skip/cancel. They reject a promoted execution flag, rebound
historical approval, old stage, altered command/source/payload, missing placement,
mixed historical runner, missing/extra/altered file receipt and wrong helper/runtime.
Independent source review found that a length-only steps check was insufficient;
the complete normalized32-step hash is now pinned and a same-length point mutation
is rejected.
The initial Node `--test` invocation emitted only a single file-level result;
[that log](file-level-test-discovery.log) is retained and is not counted as16.
Direct execution of the final `node:test` file emitted the16 named checks recorded here.
JavaScript syntax check and the [saved-receipt admission](admission.json) passed.
The latter always returns `execution_admitted:false`, including for a valid packet.

No application, helper, Windows process, native getter, provider or audio endpoint
was invoked. The new executable was read as bytes only. Lead's existing172 focused
checks and separately attributed126/46/18 checks were reviewed and reused, not
rerun or summed. Author memory5-group/7-exit evidence remains memory evidence.
None establishes sound, synchronized floating captions, physical cancellation,
capture-to-real-AI, microphone/system audio or a macOS result.

## Reviewable entry, placement steps and admission

[Candidate](candidate/candidate.json) gives the exact cached executable and new
stage app argument, main/helper/runtime hashes, separate unused scratch/profile/
userdata, ports, complete proposed PowerShell argument array and source pins.
The native command is proposed only; its status is NOT_ALLOCATED_NOT_EXECUTED.
No native scratch was created. The app's package main selects the entry above.
The recorded base entry has the stage as its app argument; the diagnostic runner
adds `--remote-debugging-port=43123` and `--remote-debugging-address=127.0.0.1`.

[Runner](candidate/runner.ps1), [32 steps](candidate/steps.json) and
[generated surface](candidate/surface.html) reuse the reviewed placement logic.
The runner changes only the literal isolated Edge profile from the prior2558ecee
snapshot. Its **new** hash is
`4a9b9b9cee7a843d5f35d97bb4f5c078d233b3a2cb81d2ac96b4813245cd0302`;
steps: `c3e5141018f30e9ed20975e9461c40f8c1060f8f2bea433eb915f32c404cbea3`.
Surface is unchanged69e38e1b. The old snapshot, manifest and14/16 actual failure
remain untouched. Lead's parse/compile receipt applies to its exact old runner;
new-file PowerShell parsing has not run, while constant native definitions are unchanged.
There is no parser/compiler repetition in this preparation.

All16 point checks, current geometry/freshness, guarded product launch/capture,
normal-control check before capture, read-only overlay ordering after capture and
existing exact-identity cleanup are retained. These32 steps explicitly disable AI;
they exercise the placement prerequisite when separately admitted, never TTS.
Future running Stop accessibility remains a real GUI check. Neither the pre-capture
control check nor CDP clicks certify physical Stop operability.

The new [admission-only wrapper](../../../../tests/e2e/windows/qa_tts_output_candidate.mjs)
reproduces payloads and full metadata/commands, pins the new package and validates
the saved static receipt. It has no execution path. The existing native wrapper
still pins the historical kind/runner/package and rejects this candidate. Its
historical source pins also precede the placement changes; reproduction of old
payloads does not authorize updating those pins. No prior approval is rebound.

## Changed output cases

These are manual acceptance preparations attached to existing LIVE-07/08, not an
additional request schedule. **Every actual-operation row is NOT_RUN.** The source
findings below describe implementation checks, never device passes.

| Existing behavior / case | Prepared operation and expected result | Current source evidence and remaining witness |
| --- | --- | --- |
| Default silent; Talk authorization | On a freshly released isolated session leave Talk off for the automatically triggered focus response. Enable Talk only for a subsequently permitted request; enabling it during/after an earlier request must not speak that old response. | Renderer defaults off; main records submission-time authorization and checks current Talk/mute. Actual silence, intended spoken response and controls remain NOT_RUN. |
| Current response, words and floating caption | With Talk enabled before an already allocated generated-content request, compare the actually audible words with that exact current response, selection, frame/request/session IDs and disclosure. Observe the floating caption's words, timing, clipping and movability. | Main derives text and piece index from verified own state; renderer cannot provide arbitrary text/path/sink. The answer card and part indicator exist by source; source does not prove synchronized floating captions or actual audibility. Unplayed text must not be reported as already spoken. |
| Stop reading / Mute / Talk off / Close | If an admitted reply is long enough, choose the specifically allocated interruption during a piece. Confirm old sound stops, unsaid queue stays stopped, late completion cannot advance captions or recorded prefix; text/originals survive. | Existing main/overlay synthetic cases cover each control independently. Actual acoustic endpoint, readable/reachable control and physical delay remain NOT_RUN; one interruption cannot certify all permutations. |
| New request, selection and session replacement | Only within existing permitted actions, replace an older pending response and inspect request/session IDs. End the session while playback is active when allocated; reconnect must not resume old speech. | Main pre/post-piece checks and hush/provider epochs fence older completions; session end disposes the voice. Live replacement races and all physical side effects remain NOT_RUN. No extra request is reserved here. |
| Completed prefixes and replay failure | Preserve a completed piece, interrupt/fail the next piece, then inspect saved history after clean Stop/reopen. A failed replay must retain the earlier completed prefix; generated/shown/played and unknown outcome remain separate. | Existing source/tests preserve max completed prefix; memory sink does not record played history. A short real response may supply no inter-piece witness: record NOT_RUN rather than lengthening/retrying inference. |
| Installed language and missing voice | On an allocated current mixed English/Chinese response, observe each culture transition and actual installed voice. If a required culture is unavailable, preserve response text, refuse speech truthfully and record the unknown/unavailable path. | Enabled installed en-US/zh-CN selection, bounded disposal and failure paths are covered by source/portable evidence. Actual installed voice inventory/timbre remains NOT_RUN. Do not install/remove voices or infer Melly/consistent bilingual timbre. |
| Endpoint/helper failure | If an endpoint/child failure is actually encountered in the allocated run, keep text, stop the queue, retain completed history and record the observed reason without claiming sound. | Factory fails closed on receipt/spawn/disposal failures; renderer has generic text fallback. Device endpoint failures NOT_RUN; no artificial account, global audio or policy changes are scheduled. |
| Voice input and full desktop gates | Keep the optional typed follow-up available. Unsupported speaking-to-AI remains explicit; do not substitute typed text for its test. | TTS output does not connect microphone/STT/system audio. LIVE-06 and both independent desktop §7.1 gates remain unaccepted; no macOS or Notability closure. |

Generated surface cards remain canvas pixels, with truth available to QA only.
Actual source-image inference must use the captured whole display and focus.
A future typed follow-up may request a brief simple-English description of those
cards plus a brief Chinese hint; it uses an already permitted typed-follow-up
action, not a new slot. No course solution or private source is needed. Do not
inject a fake answer into trusted state or use a synthetic response as real AI.

## Remaining admission and ownership

Lead reviews this concrete candidate, its new bytes and actual-operation subset,
then coordinates a separately pinned execution wrapper and **fresh substantive
display/account/audio allocation**. Any real connection retains the reviewed
launcher/profile setup and rechecks admission; this packet does not select a new
account or provider. Its proposed native command is not a bypass of that review.
The two human approvals are resolved historical scope, not questions to ask again.

**Real0/4 unchanged; voice-input slot unassigned, unspent and not transferable.**
The saved five-request ceiling is no lease. No planned row automatically receives
a slot, no uncertain attempt is retried and no new budget is requested. All real
permutations cannot be inferred from one future response; retain the existing
synthetic evidence and mark the unallocated remainder NOT_RUN. Stop on any actual
capability/login/usage refusal under the existing ledger. Display/account/audio
are unleased; paused automation remains paused. Web owns concrete production
defects, Lead owns integration/resource release, QA awaits that dependency.
