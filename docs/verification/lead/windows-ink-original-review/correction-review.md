# Windows ink-original correction review — APPROVE

Candidate `e7bdbde46e7cb7f8f744a0407085b747eb2bc359`, parent `46dbb9023768d7d738b84ffca4d8f8c725b02953`. Read-only exact export: `/tmp/lc-windows-ink-original-e7bdbde`. All five changed export files match their committed Git blobs. Review is limited to this correction and its changed-path regressions, using project PONYTAIL LITE. No repository or worker files were changed.

Both previous findings are closed in this bounded review. No new blocker found.

## Closure evidence

- **Previous core P2: an occupied content address was treated as proof of retained original bytes.** `apps/windows/src/main/main.ts:532–544,601–629` now checks regular-file type, exact length and SHA-256 before reusing each raw PNG, composed PNG or ink JSON. All originals are checked before any new original is written. Independent execution of actual candidate `main.ts` reproduces the old shortened-ink and directory-at-ink-address inputs with corrected outcomes: explicit whole-frame refusal, no retry flag, refusal manifest entry, and unexpected contents left untouched. A same-length ink mutation and separately corrupted composed PNG also refuse. The unchanged control succeeds without rewriting or recounting bytes. The focused owner regression additionally checks symlinks and a corrupted raw PNG.
- **Previous mapper P3: contradictory retained/refused ink metadata silently lost its refusal.** `apps/windows/src/shared/frame-ingress.ts:252–264` now permits exactly `{file,sha256,bytes}` or nonempty `{refused}`. The independent prior negative input now raises `MappingRefusal`, both with and without an ink binding. Extra fields, invalid hash paths, null and empty refusals also refuse. Valid retained bindings still work; an unbound explicit refusal survives in `unrepresented`. The older absent-field format remains accepted with its existing explicit unchecked-binding warning.

## Targeted checks actually run

- **41 named tests passed, zero failures:** 12 ink-original, 24 frame-ingress, 5 overlay-stop. These cover delayed composition snapshot through later write/partial erase/undo/redo; explicit pending/uncommitted evidence; ink storage failures and caps; queued-frame Stop drain and bounded loss reporting; cap/refusal and retry behavior. These are existing owner tests independently rerun, not new independent device QA.
- **7 independent storage cases passed:** unchanged reuse; same-length damaged ink; shortened ink; directory at expected ink address; damaged composed PNG; an actual Linux file-read `EACCES` followed by recovery; blocked ink-folder `ENOTDIR` followed by partial-write recovery. In the last case the raw/composed image aliases one file, the initial write stores/counts that PNG before ink-folder creation fails, and retry at the exact PNG-plus-ink byte cap writes/counts only the missing ink. A later identical retain adds no bytes and rewrites neither file.
- **15 independent pure-mapper cases passed:** seven current-format cases, each bound/unbound, plus legacy absent metadata. Caller plans remain unchanged. Refusal reasons remain observable when no ink binding is supplied.
- `git diff --check 46dbb9023768d7d738b84ffca4d8f8c725b02953 e7bdbde46e7cb7f8f744a0407085b747eb2bc359` passed.

The storage probe's first development invocation lacked a parent directory in its new blocked-folder fixture. Only that `/tmp` setup was corrected; the final seven-case invocation passed. This was a probe setup error, not a product failure.

## Reproduction

Node is the installed pinned `v24.21.0`; no installation is needed. Exact commands after the existing Git export:

```sh
cd /tmp/lc-windows-ink-original-e7bdbde/apps/windows
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none --test-reporter=tap tests/ink-original.test.ts tests/frame-ingress.test.ts tests/overlay-stop.test.ts > /tmp/windows-ink-original-correction-tests.log 2>&1
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-ink-original-correction-storage-probe.mjs > /tmp/windows-ink-original-correction-storage.log 2>&1
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-ink-original-correction-mapper-probe.mjs > /tmp/windows-ink-original-correction-mapper.log 2>&1
```

The EACCES case runs as the normal non-root workspace user (UID 1000 here). The probe intentionally uses real filesystem permissions. Other Electron/canvas/PNG decoding behavior is simulated by the candidate's existing portable harness.

Artifacts:

- `/tmp/windows-ink-original-correction-review.json`: exact source and evidence SHA-256 receipt.
- `/tmp/windows-ink-original-correction-storage-probe.mjs`, `-storage-results.json`, `-storage.log`.
- `/tmp/windows-ink-original-correction-mapper-probe.mjs`, `-mapper-results.json`, `-mapper.log`.
- `/tmp/windows-ink-original-correction-tests.log`.

New storage probe SHA-256: `4e1a722d372bbb91077b489e210fdaa84b7a7f4e8df64db2e472332cb252caaf`.
New mapper probe SHA-256: `7c9bc95a124fade3bbf7ea694b384806807c4bb8963015e17fe92798aed5497c`.
Old failure probes remain unchanged: `/tmp/windows-ink-original-storage-probe.mjs` (`cd15ff9c74bac469924872fd6fa1999b94398ba24ac2d1a05bfbb1417bbce1d1`) and `/tmp/windows-ink-mapper-negative-probe.mjs` (`c838eba4439203b34d4ae1a232d2bb950998207d6b7bb3ae26db6da9a4d2aa6e`). Prior reports/open-snapshot controls are preserved.

## Limits and next owner

This closes the two source/portable findings only. No native Windows launch, real display/input, actual Electron image decoding, new build/type-check, hosted run, API/storage/Learning composition or provider call was performed. The owner's 101-test/type-check claims are separate evidence. Original-live-screen/real-AI product gates remain open. Lead owns integration, exact-main checks/build, the ordinary Windows hosted run and API composition.
