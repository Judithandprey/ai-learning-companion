# Fixed Windows artifact recovery preparation — 2026-10-20

**PREPARED_NOT_INSTALLED_OR_RUN.** All 81 fixed application payloads and all
73 cached Electron runtime files are available in a fresh Support-owned `/tmp`
preparation. Every application payload matches the original manifest; the
resulting application tree is unchanged. No rebuild or download was necessary.
Lead retains installation, final verification, integration and allocation.

This closes the bounded recovery-preparation dependency from
`handoff_e4834c5a05772dd32fd5836ee04dd53d`, read in ordered request
`support-mail-20261020-1120`. It does not repeat the completed Candidate08 review.
The reported absence of the Windows-stage payloads remains unexplained; this
work establishes reusable originals, not the cause of the loss.

## Fixed identity and prepared paths

- Product: `0ff325beadb7c689244610307b6aa16d638fd2e6`.
- Original manifest:
  `194986dea3e120a3b8806a9e7bb2c06bfefb5cf7:docs/verification/lead/live-windows/nonvoice-driver-review/stage-0ff325b.json`.
  Its byte SHA-256 is `33db2d2e85d74b77866b70d5bca6c589125a22977cd0400e03fcfa107c788311`.
- Prepared application:
  `/tmp/support-artifact-recovery-0ff325b-riehg1x0/prepared/lc-windows-admission-0ff325b`.
- Exactly **81 files**, tree
  `081a130c1f492c98d78fec8d67463a36c80126ea1ca72eede99d043ca616a46a`.
  Tree calculation retains the original sorted POSIX-path/NUL/hash/LF algorithm.
- Prepared runtime:
  `/tmp/support-artifact-recovery-0ff325b-riehg1x0/prepared/lc-electron-44.5.1-win32-x64`.
- Complete per-file paths, sizes, hashes and provenance:
  [prepared-inventory.json](prepared-inventory.json), SHA-256
  `b4615e963df0217e2344609cd64688d680762425ce2b92705db6bd4460fc5d16`.
  An identical inventory and the untouched original manifest/compile receipt
  are beside the two prepared directories.

## Existing sources and validation

The bounded [source search](source-search-summary.json) found all 81 matching
payloads under the main repository's existing `apps/windows` output. Each file
was checked against the fixed manifest before copying, and checked again after
writing. A final recursive readback confirmed the exact file set and tree hash.

| Allowed source root | Matching | Different | Missing |
| --- | ---: | ---: | ---: |
| `repo/apps/windows` | 81 | 0 | 0 |
| `wt-web/apps/windows` | 78 | 0 | 3 |
| `wt-review/apps/windows` | 42 | 19 | 20 |
| `%TEMP%/lc-windows-tts-52be105` | 0 | 0 | 81 |
| `%TEMP%/lc-windows-live-1755153` | 0 | 0 | 81 |

The old-stage counts compare the current 81 expected paths, not an independent
historical-stage audit. No mismatching candidate was copied.

The original native build also survives at
`/home/agentsdock/Projects/learning-companion/repo/apps/windows/native/build/build-lead-52be105-20261003-01`.
Its source, executable and receipt match the staged copies. The receipt is
byte-identical to
`ad7bd72a8e902b366fbbb71d90f530c18043a251:docs/verification/lead/live-windows/approved-two-gates/tts-integration/compile.json`.
No native compilation or helper execution occurred.

| Native payload | SHA-256 |
| --- | --- |
| `NativeSpeech.cs` | `c4c1f127a85ff1c871ce98895d51584af7936bbf23f3a35c7418002f201cbbfd` |
| `NativeSpeech.exe` | `21c7bed3fedcdefdccc2f45b799bfebb417df7a56f44f656523d303e7b349e10` |
| `build.json` | `feffa19d564031d9a0cf112ec61140ca01946465b1bd91ff0f83b337d190c407` |

Electron was extracted from the existing
`/home/agentsdock/.cache/electron/773aa4e04f5abf2d0c5fef6d69bfaa8ef10f8e9615d6ee8300fd1f572dfbc32b/electron-v44.5.1-win32-x64.zip`.
Archive size is 157998329 bytes, SHA-256
`9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db`.
This is the observed local cache identity, not a freshly fetched publisher
checksum. All 73 archive members were read with ZIP CRC validation, copied into
the fresh directory and read back with matching SHA-256. The runtime inventory
tree is `42b423eafa7ed252eb8a06a0168c27a9b64f8d934810d20c6415d83564348504`.

| Restored runtime file | SHA-256 |
| --- | --- |
| `electron.exe` | `49b61a030a520fc36a4b8fa5cce53fb4e935a7bdbbe4b80e9222f598e49cc7fa` |
| `version` | `d6a753840246d37b3b1450cce3259a0d1a1954d8d196276e11fdf094a6a04652` |
| `resources/default_app.asar` | `0eb2491b0a9ac94790389d39c09dd5005c6c1f0665842943829bbd0193f6cc4f` |

The executable matches the original stage's runtime pin. `version` contains the
original six bytes `44.5.1`; no runtime metadata was fabricated.

## Execution and handoff boundary

The [preparation script](../../../../tests/probes/support/prepare_fixed_windows_artifacts.py)
ran once, exit **0**, empty stderr. [Execution receipt](execution.json) records
the exact command, script hash and inventory hash; [stdout](preparation.stdout.json)
records the resulting paths and identities. The script only invokes read-only
`git show`, reads approved local sources, and writes the fresh `/tmp` preparation.

No existing Windows stage/runtime, product source, user profile, ink, auth,
account, provider, display, microphone, audio, TTS, policy or service was changed
or operated. No app/helper was launched and no new runtime agent was created.
QA remains owner of real **0/4**; old leases remain retired.

No unrecoverable payload remains in this preparation. Lead's next action is to
install these byte-checked originals into its intended stage/runtime under its
existing scope, verify the installed file sets and pins, and decide any later
allocation. These prepared files do not establish installation, native usability,
live product acceptance or a new execution lease.
