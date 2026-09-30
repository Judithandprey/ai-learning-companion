# Windows uploader portability repair — 5dc8493

**APPROVE for the bounded test-only repair**, with a P3 helper-cleanup finding below. This author evidence does not replace the pending exact-source hosted stock Node 24.21 gate. No production source changes or false uploader acceptance were found.

Candidate `5dc84936aa0c2d6765696092907a885c9f0ee6a6`, parent `3885987a1eef702512f868e6db04550791e319cb`; full four-file delta read. Compared the test change against main `687a58bc91df2bf651c14c2cffd66eabc2907ed6`, preserving the lead's prior failed-precondition cleanup. `apps/windows/src` is unchanged against that main. `git diff --check` passes. Exact files are exported under `/tmp/windows-portability-5dc-export`.

## Behavior and evidence

- The command is a fixed PowerShell script, with the synthetic capture-copy file supplied as `LC_HOLD_FILE`, not interpolated into code. Ordinary inherited environment remains inherited; no new authority or credential is passed by this helper. `-NoProfile`, `-NonInteractive`, hidden window and piped stdin/stdout are explicit. This is the test's owned child, not application startup or a provider operation.
- FileShare.None replaces the numeric EXLOCK precondition shown ineffective by actual hosted run 36762077273. Successful helper readiness alone cannot pass the case: line 915 separately requires a real second open to throw `EBUSY`; its catch awaits release. The POSIX catch still restores 0644. The test then requires `refused` at stage `local` with the unreadable reason (lines 854–859), awaits release in `finally` (964–968), and checks zero received requests (972). Thus a helper that printed readiness without acquiring the lock does not silently pass.
- Both saved Windows receipts contain four SHA-256 values matching the **raw Git blob bytes exactly**, with no line-ending normalization. Test SHA-256: `d4838fb5112171481badd6ac7a526426ac77e461096a4bf84f4070d2a33df219`; uploader: `7bd134b93847ec987f413830cc1e9fbd5f9bb9de6aefd45fac4fceed402afb9d`; frame mapper: `bfdba8bf7f5f2648c761547259e2a0db5c5b5d5ce8fe79ffbd171fdc35830389`; fixture script: `8bad5c3cb8758fb6ef7c32aedfc9f97b2ebe02dd8e4b0f16ee9ae8e4866b7774`.
- Stock Windows x64 Node 24.19: **34 tests = 26 pass + 8 skipped, 0 fail**, 34,457.8821 ms. Electron 44.5.1's Node 24.21: **16 tests = 13 pass + 3 skipped, 0 fail**, 30,327.2589 ms. Named pass/skip lines independently match both summaries. These are author-saved runtime/hash receipts; the receipt generator is not part of the four changed files. They do not establish stock Windows Node 24.21 execution. The report explicitly leaves that hosted run to the lead.
- Three skipped file-link cases remain scoped to missing Windows symlink privilege; the full run additionally skips one POSIX-pipe and four conditional Backend cases. Linux 34/34 and full 140-test statements remain author evidence; not re-executed here.

## P3: helper lifecycle cleanup is incomplete

`apps/windows/tests/uploader.test.ts:75–94` leaves its 30-second readiness timer and 10-second release timer registered after normal completion; the recorded ~30-second run floor is consistent with this. It subscribes to child `exit` but not child `error` or stdin `error`. A failed asynchronous spawn (`ENOENT`) or pipe `EPIPE` can escape as an unhandled error. After the release deadline, line 82 awaits `exit` without another bound and ignores the result of `kill()`; a failed kill with no exit leaves release pending.

Four checks of the **exact extracted helper** with Node EventEmitter/spawn/clock doubles reproduce these paths: **4 pass, 0 fail, 49.011831 ms**. These are passing reproductions of the observations, not proof the helper is corrected, and do not reproduce Windows locks or actual process-kill failure. The latter conditions affect test failure handling; no supported-runtime false pass, production impact, leaked credential or real orphaned process was demonstrated. They are nonblocking for running the hosted gate.

Minimal cleanup: cancel the losing timers, observe child/stdin error or early close, and bound the final exit observation after kill. If exit cannot be confirmed, fail explicitly rather than report release. Keep the existing read-denial, local-refusal and no-send assertions; no new process framework is needed.

Reproducer and output:

```sh
.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none --test-reporter=tap /tmp/windows-portability-5dc-helper-probe.mjs
```

`/tmp/windows-portability-5dc-helper-probe.{mjs,json,log}` and `/tmp/windows-portability-5dc-review.json` retain exact hashes and observations. Only these four helper-double checks were executed. No 34-test rerun, Windows/desktop launch, real helper child, Backend listener, DB or provider operation occurred. Repository and worker files were not changed.
