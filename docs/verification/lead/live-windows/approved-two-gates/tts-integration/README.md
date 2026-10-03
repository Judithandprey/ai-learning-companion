# Approved native speech: reviewed integration and distinct candidate

2026-10-03. Existing P0-07/P0-12 → P1-03, R09/R57/R60, §7.3,
A05/A06/A14/A47–49 and AUDIO-08/09/14/15. No new requirement or assignment.
Human source/compilation approval remains [the exact recorded decision](../README.md).

## Delivery and review

Actual Web `dff86d972d09115b9b8a480be43e33e9d3069d1a` arrived through
`handoff_e2b5083b4b47207597da018e07e6cd23`, read in ordered batch
`mailread_7267a18a015b47b4998fcee13c6e13cd` (seq961). Parent `095e259`
matches the unchanged Windows source already on main. Reviewed source integrates
normally as **`52be105a148a28e677f83cc4b7077665f2ff372c`**.

Two scoped independent reviewers approve main/renderer and native/provider/package
boundaries. Current verified request/text/model/disclosure/Talk/session is checked
before each speech piece and after completion. Stop and replacement requests fence
late completions. Completed prefixes survive replay failure. Culture replacement
waits for observed child exit; unobserved cleanup fails closed. Each actual spawn
checks the fixed bundled helper/source against its local compilation receipt.

One considered bare-factory concurrent-culture edge is unreachable through the
production caller: `r.saying` rejects overlap; replacement readings call
`hush → stop` before a fresh `say`, advancing the provider epoch. This is a current
caller invariant, not a claim that arbitrary concurrent callers are supported.

Independent exact-source checks: **126 main/overlay**, **46 native/provider**, and
**18 synthetic packaging** pass. Native/packaging checks withheld child-process
permission. All final logs use this project's Node24.21.0. Reviewers initially
located another identical Node binary; final evidence was rerun with the original
project path and no comparison-project service/data changes. Counts overlap author
and Lead runs and are not summed into product acceptance.

Lead's **172 focused resulting-main checks pass**, zero failure/skip/cancel.
TypeScript compilation/static packaging succeeds. [204 saved-evidence/source/build
hash checks](evidence-audit.json) match: 94 source, 13 requirements, 17 evidence,
77 author bundle and 3 author local-build files. Author memory evidence reports
5 groups/7 observed child exits on its own compiled helper. Lead did not repeat
that native synthesis or reinterpret it as audible output.

Source/report whitespace checks pass. Two whitespace-only lines in the retained
historical failing author log remain unchanged; they are reported rather than
rewriting execution evidence. The unrelated dirty team-directory file is preserved.

## Actual integrated build and package

Lead compiled the approved source again with installed Windows Node24.19.0 and
the installed Framework64 .NET compiler; [receipt](compile.json) has status0,
error null. This is source compilation, not import of the external candidate exe.
Approved source SHA-256:
`c4c1f127a85ff1c871ce98895d51584af7936bbf23f3a35c7418002f201cbbfd`.
This build's executable SHA-256:
`21c7bed3fedcdefdccc2f45b799bfebb417df7a56f44f656523d303e7b349e10`.
It differs from the author's compiled artifact; the author's memory run is not
claimed as execution of this new binary. No new helper or application was run.

- Fresh stage: `%TEMP%\lc-windows-tts-52be105`.
- Cached runtime: `%TEMP%\lc-electron-44.5.1-win32-x64\electron.exe`, hash
  `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa`.
- Production entrypoint: `dist/apps/windows/src/main/main.js`, hash
  `9969b8afa2b3f3df82d3733c5d6e8adec5c34393af49d2d10c88704d68982128`.
- [Manifest](stage-manifest.json): **77 files**, exact file set and every hash
  checked; tree `531943a83d3572ca9c686c7d8cd62bd88da5b0401b84050487722b8e87a02669`.
- Bundled provider construction passes with child-process permission withheld;
  no `say` or helper spawn occurred. Ordinary builds without `--native-build`
  still omit speech deliberately.

Staging used a new path, launched nothing, downloaded nothing and touched no
old package/profile/auth. Existing `lc-windows-live-1755153` and older user stages
remain. After the coordinated acceptance release, the new entry is the existing
cached Electron executable with this stage as its sole app argument; retain the
reviewed connection/profile setup rather than guessing a new account path.
No automatic launch, old-app replacement or profile migration accompanies this
record. Rollback remains reopening the preserved earlier stage after clean Stop/exit.

## Promised bounded behavior and next owner

This candidate adds installed-voice output for a current, verified Talk-authorized
response to the existing live/automatic-focus/caption controls. Default is silent.
Main owns speech text/path/sink; renderer supplies no arbitrary speech authority.
Mute/Stop/Close/new request/session end cancel the old reading and unsaid queue.
The existing Voice boundary remains replaceable: Melly and consistent bilingual
timbre are not implemented, and English/Chinese system voices may differ.

Actual audible output, caption synchronization on a real endpoint, physical
interruption latency, microphone/system audio, continuous real GUI-to-AI and
interactive Mac remain **NOT_RUN/unaccepted**. Typed follow-up works at source/test
scope; no usable voice input engine is claimed. Full P1–P4 and both desktop gates
remain open. Source, memory synthesis, packaging and device evidence are distinct.

QA retains its **one current offline own-surface placement correction** after
the actual14/16 ownership stop. This record does not repin or replay that fixed
1755153 diagnostic, acquire a display/account/audio lease, or spend the real0/4
ledger. At its next safe handoff, the same QA owner prepares changed-path acceptance
against this exact new package after Lead reviews the surface correction. Web owns
any concrete product defects from it. Lead coordinates a fresh bounded resource
allocation; old human approvals are resolved, not pending again. Real speech and
matching captions still need actual listening evidence; neither this compile nor
the former display-only approval is an audible pass.

Raw logs and hashes are adjacent. Native dispatch receipts and any actual owner
adoption are recorded separately; delivery alone is not execution.

## Publication and actual handoff

Ordinary push succeeded; origin/main was independently read back as
`ad7bd72a8e902b366fbbb71d90f530c18043a251`. Web release reply
`handoff_d3fd78d98223aadb3e11d992b111e32d` and QA's same-assignment next-preparation
update `handoff_4e8a3b554079777a3c4f701b6a69837b` were actually accepted through
the currently granted native routes. Both receipts are initially unread with
`execution_started:false`, not claimed owner adoption.

Read-only worktree observation found QA already editing its owned placement
preparation/test paths, consistent with the prior active correction; no completed
delivery is inferred from those edits. Its next output-preparation step remains
offline until the exact controlled-display candidate is reviewed. No fresh lease,
account action or voice-slot allocation is implied. Web has no duplicate task.
