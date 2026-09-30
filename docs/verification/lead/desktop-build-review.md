# Desktop build preparation review

Support delivered `bb56a08e0b0f0524d00a3c37ca06de565da2667a` in actual native
message `handoff_e8e2d69e4ccf97801893461a3c0c3185` at2026-09-30T09:18:55Z.
Read its ordered batch using `lead-support-desktop-build-20260930-0920`.
Only the delegated workflow/script and support evidence/probes are proposed;
neither desktop source candidate has been delivered for integration yet.

## Hold: two independently reproduced provenance defects

1. `scripts/desktop-checks.sh` lines84–89 only guard/archive `apps/windows`
   alongside the root build files. The actual in-progress Windows code reuses
   sibling `apps/safari-extension/src/ink.ts` and `mode.ts`. A dirty sibling was
   consumed by a simulated build and packaged under a reported clean HEAD without
   rejection or inclusion in `source.zip`.
2. Lines135–136 copy the whole app directory except `node_modules`, `.git` and
   `.DS_Store`. An ignored synthetic `.env` entered `WindowsDesktop.zip`, although
   absent from source evidence; the script returned `checks-completed`, exit0.
   Local ignored files must not become published artifacts.

The retained independent reproduction is `/tmp/desktop-build-review-probes.py`.
It uses real Git/Node/Python/ZIP with stub OS/npm/build commands, not native
compilation. Nine author orchestration tests and Bash syntax pass. Initial missing
Node on the review shell PATH was corrected using the project's pinned toolchain.
Manual/main-only workflow scope, immutable existing action pins, quoting and
failure-log retention have no additional review finding.

The initial hypothesis that Electron's CLI cannot obtain a skipped binary was
refuted by the actual installed Electron44.5.1 `cli.js`/`index.js`: it calls
`install.js` when the executable is missing. No network download was performed,
so actual cold-cache acquisition remains unexecuted platform evidence.

## Same owner and next action

One bounded correction was accepted as `handoff_e03dd4386aa490a12541d2b4fbc3debd`,
replying to the actual delivery. That receipt was initially unread/not started;
it does not establish that a fix exists. Support retains the same task/write
scope: use the actual bounded committed dependency closure for validation/source
evidence, and package only reviewed committed runtime assets plus fresh build
outputs, with negative regressions for local ignored files and dirty siblings.
Preserve all owner work; do not clean/reset their checkouts or modify app source.

Lead holds integration/hosted dispatch until the concrete correction is reviewed.
Actual Windows/macOS owner commits and package/resource contracts are still
prerequisites for the coherent hosted build. The first hosted check will not be
real interactive Mac, screen/audio/input/provider or full-product acceptance.
No services, user-preview database, Paperclip, signing or settings were changed.
