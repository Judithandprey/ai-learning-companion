# Saved-ink context pictures — APPROVE

Exact candidate `bb6761109cbca86c65e7b3f2e68deb95cab8b1d8`, parent `e7bdbde46e7cb7f8f744a0407085b747eb2bc359`; export `/tmp/lc-windows-context-bb676`. All three changed files match exact committed Git bytes. No new blocker found within this correction. No repository or worker writes.

Applied project PONYTAIL LITE, current workflow and affected source/English requirements, notably R46/R52/R59 and §7.4: preserve editable original/history and contemporaneous pictures, report unavailable evidence honestly, and keep originals separate from derivative/export claims.

## Source judgment

- `apps/windows/src/main/main.ts:732–746,801–805,824–838`: saving/retrying held context pictures now checks the occupied address before trusting it. Wrong-length/wrong-hash/nonregular entries remain untouched; the save fails explicitly and keeps the ink plus good received bytes for recovery. A missing picture with no held copy remains an explicit gap under the existing behavior. No automatic quarantine is required for this bounded correction.
- `main.ts:330–364`: pruning releases a wanted held picture only after the on-disk regular file matches its length/hash. Read errors preserve the wanted copy. Export prefers held good bytes; otherwise it hashes the disk bytes and exports that same checked buffer, omitting nonmatching entries with `context_pictures_missing` and additive `context_pictures_not_matching` evidence.
- `main.ts:861–901`: Pictures view uses the same returned checked buffer and distinguishes absent, nonregular, changed, unreadable and oversized-for-display states. A symlink to even a valid picture is not treated as the regular stored original.
- Traced retry/fork/conflict handling, recovery resolution, explicit discard pruning, Stop/finish spare export and held-ink quit handling. These use the same preserved originals; no new overwrite or silent recovery-loss path found. The shared `storedOriginal` return-type change is also exercised against retained PNG/ink-original regression tests.

## Executed evidence

**30 named tests passed, zero failures:** 5 new context-picture tests, 12 ink-original tests and 13 main-lifecycle tests. Existing tests are independently rerun author scenarios, not independent native QA.

**Three independent scenario groups passed** against actual candidate main.ts in the existing fake-Electron harness, using real Linux files:

1. An occupied picture address refuses saving, preserves the unexpected bytes/inode/mtime, and retains the supplied good picture through an unrelated successful save/prune, repeated refused Retry, Stop, spare export and user export. Moving the unexpected file aside preserves it; Retry then writes the exact original document/history and picture, and a new session's Open/readback path receives the same document.
2. Actual read `EACCES` preserves the good received picture through prune/export; restoring access permits Retry and the Pictures view shows the original.
3. Once a successful save has released its held copy, disk corruption is never exported or displayed under the original image identity. Missing/nonmatching evidence is explicit. A symlink to a genuine copy is likewise omitted and reported, without changing the link or target.

The identical independent probe run against parent `e7bdbde` fails at its first negative assertion: saving at a corrupt context-picture address incorrectly returns `ok:true`. This is an expected baseline failure, demonstrating the correction changes observable behavior.

`git diff --check e7bdbde46e7cb7f8f744a0407085b747eb2bc359 bb6761109cbca86c65e7b3f2e68deb95cab8b1d8` passed. During probe development, only two `/tmp` setup assumptions were corrected (the actual load event name and using the empty pre-save document for the unrelated copy); neither was a product defect.

## Reproduction and artifacts

```sh
cd /tmp/lc-windows-context-bb676/apps/windows
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none --test-reporter=tap tests/context-pictures.test.ts tests/ink-original.test.ts tests/main-lifecycle.test.ts > /tmp/windows-context-bb676-tests.log 2>&1
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-context-bb676-probes.mjs > /tmp/windows-context-bb676-probes.log 2>&1
# Expected failure on the preserved parent export:
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-context-bb676-probes.mjs /tmp/lc-windows-ink-original-e7bdbde > /tmp/windows-context-bb676-baseline.log 2>&1
```

Run the EACCES probe as the normal workspace user, not root. Node is installed pinned `v24.21.0`; no installs needed. Receipt `/tmp/windows-context-bb676-review.json` records exact source/artifact hashes. Probe results: `/tmp/windows-context-bb676-probe-results.json`; logs and probe are named above. Prior review artifacts were preserved.

## Limits / next owner

No native Windows display/input, real Electron image decoder, build/type-check, hosted run, API/Learning composition or provider was exercised. Portable Open checks the main-process handoff, not actual renderer editing. Best-effort spare files do not prove crash durability or automatic import. The author's documented external-writer check/rename race remains an inherited limit; this review does not claim a concurrent arbitrary-filesystem-writer guarantee. Lead owns integration and exact-main verification; full desktop/real-AI product acceptance stays open.
