# Web byte-range unreadable-original correction — 7626321

**APPROVE the integrated test-only read-denial correction and narrow lead-owned cleanup.** The demonstrated P3 exceptional-cleanup issue below is resolved; its original reproduction remains recorded. No production or ordinary acceptance-gate blocker found. Candidate `7626321fadf7d103e497af393b651898af1c2364`, exact parent `99cddcdcf532931cb3809fe5c278c35bb021889f`; all four changed files read. Production source is byte-unchanged against parent and main `03c3688`; `git diff --check` passes.

## Source behavior and evidence

`unreadable` saves the exact original bytes and identity, starts a fixed PowerShell script that opens shared read/write/delete and locks the full current length, then independently opens a Node fd. It checks dev/ino/size against the original and requires a real `readSync(fd, ..., position=0)` to throw EBUSY (lines 939–940). The fd always closes in `finally`; failed preconditions await owned-helper release. A printed readiness marker alone cannot pass this precondition.

The helper remains alive across the actual uploader call. The existing assertions still require `refused`, stage `local`, the platform-specific reason, and zero observed requests. Windows now correctly expects **cannot be read**; POSIX retains **cannot be opened**. `finally` awaits release and then checks byte-for-byte restoration (line 950). Existing POSIX failed-precondition permission restoration remains. There is no broad skip or simulated read failure introduced. Read-denial coverage is accurately distinguished from open denial.

Both author Windows receipts' four SHA-256s match exact **raw Git bytes**, without normalization. Test hash: `68b94ad062bfa12c6166f2295485699081e522a08e50f0434851589b05f9f0c3`; production uploader: `7bd134b93847ec987f413830cc1e9fbd5f9bb9de6aefd45fac4fceed402afb9d`. Mapper/fixture-script hashes also match and are in the machine report. Named result lines agree with each summary:

- Stock Windows Node 24.19: **34 tests = 26 pass + 8 skipped, 0 fail**, 4,884.9785 ms.
- Electron 44.5.1 / embedded Node 24.21: **34 tests = 26 pass + 8 skipped, 0 fail**, 3,016.2887 ms.

The eight skips remain three unavailable file-symlink cases, one POSIX pipe case and four conditional Backend cases. These are author-saved execution receipts. The hosted stock Node 24.21 byte-range diagnostic supports the chosen mechanism, but is not this exact candidate's uploader test run. The unchanged Linux-suite claims were not rerun here; lead independently reports the changed Linux group 8/8 on its isolated candidate.

## Helper lifecycle: positive checks and P3 caveat

The changed helper cancels readiness/release timers, consumes stdin errors, handles failed spawn, and adds a five-second final deadline after its ten-second release timeout. The fixed command uses only a synthetic file path through environment, with no command interpolation or new credential. Four exact-extracted-helper checks using Linux Node/spawn/EventEmitter/manual-clock doubles ran: **4 pass, 0 fail, 48.81616 ms**. Normal exit leaves no live timer; ENOENT rejects readiness; an unresponsive helper with no error reaches the final deadline and fails.

**P3 — child error is incorrectly treated as confirmed exit**, `apps/windows/tests/uploader.test.ts:81`. The `exited` promise resolves on any child `error`, although errors can occur after a successful spawn. The fourth probe reproduces: readiness → release → ten-second deadline → `kill()` emits EPERM and returns false without exit. `release()` then resolves and cancels its final deadline despite no exit event. This is a passing reproduction of a defect, not evidence it is fixed.

Impact is limited to this owned test helper's exceptional cleanup. No actual Windows kill failure/orphan, production loss or false uploader acceptance was demonstrated. If the original remains locked, the final byte-recovery assertion still fails; a live child may keep the runner alive until its outer bound. This does not block running the normal hosted test gate. Minimal correction: separate genuine startup failure from observed termination; a post-spawn kill error must fail or continue the bounded wait for real exit, not certify cleanup. No process supervisor or broad test campaign is needed.

The helper also intentionally accepts process exit without checking its code, including forced cleanup, while the caller checks readable original bytes. Therefore this test proves recovered contents and bounded ordinary release handling; it must not be presented as a verified graceful sentinel/unlock protocol.

Reproducer: `/tmp/windows-byte-range-owner-helper-probe.mjs`; observations/TAP: corresponding `.json` and `.log`. Run with:

```sh
.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none --test-reporter=tap /tmp/windows-byte-range-owner-helper-probe.mjs
```

Exact export: `/tmp/windows-byte-range-7626321-export`. Machine report: `/tmp/windows-byte-range-owner-review.json`. No Windows/PowerShell/CI/DB/native launch, uploader suite, repository/worker edit or owner-patch application occurred in this review.

## Integration cleanup recheck — P3 resolved

Lead integrated the owner candidate as `9b52289` and changed only the child-error callback to resolve the no-process path when `helper.pid === undefined`. I read the actual repository diff without modifying it. A successfully spawned helper retains a PID after kill failure, so that error no longer certifies termination; the actual exit event or final failure deadline remains authoritative.

The same four exact-helper checks ran against the corrected source: **4 pass, 0 fail, 47.080591 ms**. Normal timers still cancel; a true ENOENT with no PID still rejects readiness; a silent no-exit child still fails its final deadline; and kill EPERM on the successful PID-12345 double now leaves release pending, then rejects at five seconds without an exit event. This closes the concrete P3 reproduction. No additional cases or suite were run.

Corrected source snapshot: `/tmp/windows-byte-range-owner-corrected-uploader.test.ts`, SHA-256 `3d43294ee5f930affa78d616d5d4b04ee86578d24206b6d854ca10ecc4f1e85e`. Before review and probe remain `/tmp/windows-byte-range-owner-review-before.{md,json}` and `/tmp/windows-byte-range-owner-helper-probe.{mjs,json,log}`. After probe/output: `/tmp/windows-byte-range-owner-helper-after.{mjs,json,log}`. Author Windows hashes above still refer to the original owner candidate; these portable doubles do not claim Windows execution of the cleanup edit. No remaining blocking finding in this bounded review.
