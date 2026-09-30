# Desktop build preparation review

Support delivered `bb56a08e0b0f0524d00a3c37ca06de565da2667a` in actual native
message `handoff_e8e2d69e4ccf97801893461a3c0c3185` at2026-09-30T09:18:55Z.
Read its ordered batch using `lead-support-desktop-build-20260930-0920`.
Only the delegated workflow/script and support evidence/probes are proposed;
neither desktop source candidate has been delivered for integration yet.

## Original hold: two independently reproduced provenance defects

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

## Actual corrected delivery

Support returned `f2436a1030b4e57deb06a1ba7d9fb77a49fd8aad` after preserved
`bb56a08`, through `handoff_8f5a4d70a2b46a419b8c2691e3f33ea0` at09:29:39Z.
Read the complete ordered batch with `lead-support-provenance-fix-20260930-0935`;
the worker HEAD and clean state were independently checked. Support reproduced
both original defects before correcting them in the same three scoped paths.

The correction pins one commit and archives its full committed tree as
`source.tar.gz`, covering transitive source inputs. Builds/tests occur only in a
new `work/source` extraction, using Python3.12's data filter to reject escaping
links. Known Windows sibling ink/mode inputs must exist and match the commit;
unrelated local edits are preserved and cannot enter the isolated build. Windows
runtime packaging includes only `package.json` and freshly generated `dist` with
the installed Electron runtime. Committed stale `dist` is rejected. Local ignored
files, stale outputs and source-only notes are excluded from runtime packaging.

Lead read the complete correction and revised regressions. On exact clean
`f2436a`, Bash syntax and **16 orchestration tests pass in4.091s** using the
project's existing Node/Python tools. OS/npm/Swift/ditto remain explicit stubs;
this is no native build, launch or platform acceptance. The original independent
reviewer approved the correction after16 orchestration tests and five additional
adversarial probes: both original failures, dirty root-configuration isolation,
rejection of a `main` outside `dist`, and rejection of a relative escaping link.
Both reproduced findings are closed; actual owner package contracts remain a
separate integration prerequisite.

## Integrated preparation and verification

Lead integrated preparation and correction together as `d0985f1` and `296d08a`.
On the integrated main, **16 tests passed in3.967s**, Bash syntax and
`git diff --check` passed. The unchanged five independent probes also pass when
their fixture import points at main's harness instead of the worker copy.
Reproducer: `/tmp/desktop-build-correction-review-probes.py`. The original
checkout/local files remain untouched; rejected inputs produce nonzero results,
not fake successful packages. No native compiler or dependency download was run.

```sh
PATH="$PWD/.tools/node-v24.21.0-linux-x64/bin:$PATH" \
  .venv/bin/python -m unittest discover -s tests/probes/support \
  -p test_desktop_checks.py -q
bash -n scripts/desktop-checks.sh
```

The build-preparation source is ready for normal publication. Lead waits for the
actual committed Windows/macOS candidates and confirms their final resources and
launch contract before dispatching one coherent hosted build. Support returns
on demand for a concrete interface/build failure; the correction is not a new
platform assignment. QA keeps the existing conditional Windows behavior check.
Hosted build/package evidence will remain separate from interactive Mac access,
real full-screen capture/input/audio, real AI and complete product acceptance.

## Actual Mac owner interface adopted

Once both platform source candidates arrived, Support returned the bounded
adaptation `61c3cadc1c8163a5befc47a3ace91e9a2289290f` in actual native mail
`handoff_4ed6d19e29cdebf6b331eefc93b1ed85` at2026-09-30T10:08:21Z. Its exact
Mac interface source is `7efa46a`: executable `package-app.sh`, owned Info.plist,
and `COMPANION_DESKTOP_FIXTURE_DIR`. The script/test-fixture Git blob is identical,
`0f263fde3e44531cac162e96a064326cc2f3cd21`.

Independent review approves the narrow adaptation. The snapshot's owner script
performs the release build once and assembles the actual `.app`; the lane packages
that whole bundle with native resource attributes, runs release-configuration
tests, and retains the unchanged emitted status/events/two PNG fixture outside
excluded build work. Missing targets, script, bundle identity or fixture fail.
Later test failure retains the already built app and any emitted fixture with
nonzero status. Windows packaging/provenance rules remain unchanged.

Integrated as **`cc1d26fc42c75851d149595b6e383b84c4e74d6a`**. On main:

- 18 orchestration tests passed in5.854s; Bash syntax and diff checks passed.
- Six unchanged independent probes passed: manifest failure, plist lint failure,
  wrong executable identity, malformed events, invalid PNG, and nested bundle
  resource preservation. Reproducer `/tmp/desktop-macos-interface-review-probes.py`
  was executed with only its fixture-import path redirected to main.

All native tool calls in these checks are explicit Linux stubs. No Swift compiler,
actual XCTest, native `ditto`, permission UI or app launch was run. The platform
source review has concrete [open corrections](desktop-candidate-review.md); Lead
will run hosted native build/fixture checks on their reviewed integrated revision.
Support's adaptation is complete and it returns on demand for a concrete failure.
